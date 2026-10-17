import {
  type CalendarGateway,
  CalendarRateLimitedError,
  NullCalendarGateway,
  resolveCalendarGateway,
} from '@/application/ports/calendar-gateway';
import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import { patientInitials } from '@/domain/patient/initials';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { logError } from '@/lib/log-error';
import { eventContent } from './sync-appointment-calendar';

/** Eventos reescritos por empresa a cada execução; o resto fica para a próxima. */
export const MINIMIZE_BATCH = 500;
/** Eventos por rajada; entre rajadas o job espera `MINIMIZE_PAUSE_MS`. */
export const MINIMIZE_CHUNK = 10;
export const MINIMIZE_PAUSE_MS = 1000;
/** Tentativas por evento quando o Google devolve limite de taxa (espera dobra). */
export const MINIMIZE_ATTEMPTS = 4;
export const MINIMIZE_BACKOFF_MS = 2000;

export const MINIMIZE_ACTOR = 'calendar-minimize-job';

export interface MinimizeCalendarSummary {
  /** Integração ausente: nada foi lido nem reescrito. */
  skipped: boolean;
  /** Eventos pendentes encontrados no lote (em simulação, só isso é preenchido). */
  pending: number;
  rewritten: number;
  failed: number;
  /** A cota do Google esgotou: o resto do lote ficou para a próxima execução. */
  rateLimited: boolean;
}

export interface MinimizeCalendarOptions {
  /** Só consultas que começam a partir desta data; sem ela, todas (padrão). */
  since?: Date;
  /** `false` apenas conta os pendentes, sem tocar no Google nem no banco. */
  apply: boolean;
}

const sleepFor = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reescrita em lote dos eventos do Google Agenda criados antes da #217 (#339,
 * AGE-RN-19): troca título e descrição pelo conteúdo mínimo de `eventContent`
 * (iniciais, horário, link). Nunca apaga evento. Idempotente e retomável: o
 * evento só é marcado depois de reescrito, então falha e cota esgotada ficam
 * pendentes para a próxima execução. Execução manual, uma empresa por vez.
 */
export class MinimizeCalendarEvents {
  constructor(
    private readonly clinicId: string,
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
    private readonly calendar: CalendarGateway,
    private readonly auditEvents: AuditEventRepository,
    /** Base pública (`APP_URL`, sem barra final); `null` omite o link. */
    private readonly appUrl: string | null,
    private readonly now: () => Date = () => new Date(),
    private readonly sleep: (ms: number) => Promise<void> = sleepFor,
  ) {}

  async execute(
    options: MinimizeCalendarOptions,
  ): Promise<MinimizeCalendarSummary> {
    const summary: MinimizeCalendarSummary = {
      skipped: false,
      pending: 0,
      rewritten: 0,
      failed: 0,
      rateLimited: false,
    };
    const gateway = await resolveCalendarGateway(this.calendar);
    if (gateway instanceof NullCalendarGateway) {
      return { ...summary, skipped: true };
    }
    const due = await this.appointments.findCalendarEventsToMinimize({
      limit: MINIMIZE_BATCH,
      startsAfter: options.since,
    });
    summary.pending = due.length;
    if (!options.apply) return summary;
    try {
      await this.rewriteAll(gateway, due, summary);
    } finally {
      await this.record(summary, options.since);
    }
    return summary;
  }

  private async rewriteAll(
    gateway: CalendarGateway,
    due: Appointment[],
    summary: MinimizeCalendarSummary,
  ): Promise<void> {
    for (const [index, appointment] of due.entries()) {
      if (index > 0 && index % MINIMIZE_CHUNK === 0) {
        await this.sleep(MINIMIZE_PAUSE_MS);
      }
      try {
        await this.rewriteOne(gateway, appointment);
        summary.rewritten += 1;
      } catch (error) {
        if (error instanceof CalendarRateLimitedError) {
          summary.rateLimited = true;
          return;
        }
        summary.failed += 1;
        // Só o id da consulta no log: nada de nome, telefone ou procedimento.
        logError(
          `Minimização do Google Agenda: falha na consulta ${appointment.id}`,
          error,
        );
      }
    }
  }

  private async rewriteOne(
    gateway: CalendarGateway,
    appointment: Appointment,
  ): Promise<void> {
    const eventId = appointment.googleEventId;
    if (!eventId) return;
    const content = eventContent(
      appointment,
      await this.initialsOf(appointment),
      this.appUrl,
    );
    for (let attempt = 1; ; attempt += 1) {
      try {
        await gateway.rewriteEvent(eventId, content);
        break;
      } catch (error) {
        if (
          !(error instanceof CalendarRateLimitedError) ||
          attempt >= MINIMIZE_ATTEMPTS
        ) {
          throw error;
        }
        await this.sleep(MINIMIZE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
    await this.appointments.markCalendarEventMinimized(
      appointment.id,
      this.now(),
    );
  }

  /** Paciente anonimizado ou ausente sai só como "Consulta" (a retenção apaga o evento). */
  private async initialsOf(appointment: Appointment): Promise<string | null> {
    const patient = await this.patients.findById(appointment.patientId);
    if (!patient || patient.isAnonymized) return null;
    return patientInitials(patient.fullName);
  }

  /** Evento de auditoria só com as contagens (nada de PII), e só se algo foi tentado. */
  private async record(
    summary: MinimizeCalendarSummary,
    since: Date | undefined,
  ): Promise<void> {
    if (summary.rewritten === 0 && summary.failed === 0) return;
    await this.auditEvents.save(
      AuditEvent.create({
        clinicId: this.clinicId,
        actorRole: 'system',
        actorId: MINIMIZE_ACTOR,
        action: 'update',
        resourceType: 'calendar-minimization',
        resourceId: this.now().toISOString().slice(0, 10),
        detail: JSON.stringify({
          rewritten: summary.rewritten,
          failed: summary.failed,
          rateLimited: summary.rateLimited,
          since: since?.toISOString().slice(0, 10) ?? null,
        }),
      }),
    );
  }
}
