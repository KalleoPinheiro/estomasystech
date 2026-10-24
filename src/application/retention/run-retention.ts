import {
  type CalendarGateway,
  NullCalendarGateway,
  resolveCalendarGateway,
} from '@/application/ports/calendar-gateway';
import type { PhotoStorage } from '@/application/ports/photo-storage';
import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import {
  type RetentionKind,
  retentionCutoffs,
} from '@/domain/retention/retention-policy';
import type { RetentionRepository } from '@/domain/retention/retention-repository';
import { zonedDateKey } from '@/domain/shared/time-zone';
import { logError } from '@/lib/log-error';

/** Pacientes anonimizados por clínica a cada execução; o resto fica para a próxima. */
export const PATIENT_BATCH = 200;
/** Arquivos de foto apagados por clínica a cada execução. */
export const PHOTO_BATCH = 500;
/** Eventos do Google Agenda apagados por clínica a cada execução. */
export const CALENDAR_BATCH = 500;

export const RETENTION_ACTOR = 'retention-job';

export interface RetentionCounts {
  clinicalRecords: number;
  photos: number;
  auditEvents: number;
  /** Entradas `waiting` cujo período terminou e viraram `expired` (#311). */
  waitlistExpired: number;
  waitlistEntries: number;
  accounts: number;
  /** Eventos do Google Agenda apagados (#311). */
  calendarEvents: number;
}

export interface ClinicRetentionSummary extends RetentionCounts {
  clinicId: string;
  /**
   * Presente quando a clínica falhou. Os contadores trazem o que já tinha sido
   * anonimizado antes da falha; o detalhe do erro fica só no log.
   */
  error?: string;
}

/** Mensagem da resposta: o erro do banco pode trazer SQL e parâmetros. */
export const CLINIC_RETENTION_FAILED = 'Falha ao processar a empresa (ver log)';
export const PLATFORM_RETENTION_FAILED =
  'Falha ao processar a trilha de plataforma (ver log)';

export interface RetentionRunSummary extends RetentionCounts {
  /** Trilha de plataforma (eventos sem empresa). */
  platform: { auditEvents: number; error?: string };
  clinics: ClinicRetentionSummary[];
}

export interface RetentionServices {
  retention: RetentionRepository;
  auditEvents: AuditEventRepository;
}

export interface ClinicRetentionServices extends RetentionServices {
  photoStorage: PhotoStorage;
  calendar: CalendarGateway;
}

const ZERO: RetentionCounts = {
  clinicalRecords: 0,
  photos: 0,
  auditEvents: 0,
  waitlistExpired: 0,
  waitlistEntries: 0,
  accounts: 0,
  calendarEvents: 0,
};

/**
 * Job de retenção (#294): anonimiza, empresa a empresa, o que passou do prazo
 * de cada tipo de dado, e a trilha de plataforma. Idempotente; cada empresa que
 * mudou algo ganha um evento de auditoria só com as contagens.
 */
export class RunRetention {
  private readonly cutoffs: Record<RetentionKind, Date>;

  constructor(
    private readonly clinicIds: string[],
    private readonly clinicServices: (
      clinicId: string,
    ) => Promise<ClinicRetentionServices>,
    private readonly platformServices: () => Promise<RetentionServices>,
    private readonly now: Date = new Date(),
  ) {
    this.cutoffs = retentionCutoffs(now);
  }

  async execute(): Promise<RetentionRunSummary> {
    const clinics: ClinicRetentionSummary[] = [];
    for (const clinicId of this.clinicIds) {
      clinics.push(await this.runClinic(clinicId));
    }
    const platform = await this.runPlatform(clinics);
    const totals = { ...ZERO, auditEvents: platform.auditEvents };
    for (const clinic of clinics) {
      for (const key of Object.keys(ZERO) as (keyof RetentionCounts)[]) {
        totals[key] += clinic[key];
      }
    }
    return { ...totals, platform, clinics };
  }

  private async runClinic(clinicId: string): Promise<ClinicRetentionSummary> {
    const counts = { ...ZERO };
    let services: ClinicRetentionServices | null = null;
    try {
      services = await this.clinicServices(clinicId);
      await this.anonymizeClinic(services, counts);
      await this.recordRun(services.auditEvents, clinicId, counts);
      return { clinicId, ...counts };
    } catch (error) {
      logError(`Retenção da empresa ${clinicId}: falha`, error);
      // O que já foi anonimizado não volta a ser contado (idempotência):
      // a trilha registra agora as contagens parciais.
      await this.recordPartial(services, clinicId, counts);
      return { clinicId, ...counts, error: CLINIC_RETENTION_FAILED };
    }
  }

  /** Preenche `counts` passo a passo, para a falha no meio não perder o feito. */
  private async anonymizeClinic(
    services: ClinicRetentionServices,
    counts: RetentionCounts,
  ): Promise<void> {
    const { retention } = services;
    const due = await retention.findPatientsDue(
      this.cutoffs.clinicalRecord,
      PATIENT_BATCH,
    );
    for (const patientId of due) {
      counts.clinicalRecords += await retention.anonymizePatient(
        patientId,
        this.now,
        this.cutoffs.clinicalRecord,
      );
    }
    counts.photos = await this.removePhotos(services);
    counts.calendarEvents = await this.removeCalendarEvents(services);
    counts.auditEvents = await retention.anonymizeAuditEvents(
      this.cutoffs.auditTrail,
    );
    counts.waitlistExpired = await retention.expireWaitlistEntries(
      zonedDateKey(this.now),
    );
    counts.waitlistEntries = await retention.anonymizeWaitlistEntries(
      this.cutoffs.waitlist,
    );
    await this.removeAvatars(services);
    counts.accounts = await retention.anonymizeInactiveAccounts(
      this.cutoffs.inactiveAccount,
      this.now,
    );
  }

  private async recordPartial(
    services: ClinicRetentionServices | null,
    clinicId: string,
    counts: RetentionCounts,
  ): Promise<void> {
    if (!services) return;
    try {
      await this.recordRun(services.auditEvents, clinicId, counts);
    } catch (error) {
      logError(`Retenção da empresa ${clinicId}: falha ao auditar`, error);
    }
  }

  /**
   * Foto de rosto da equipe (#427) é dado pessoal: os arquivos das contas que
   * serão anonimizadas saem do armazenamento ANTES, porque a anonimização zera
   * a chave. Falha de um arquivo fica no log, com a chave, e não trava a
   * anonimização (o prazo legal da conta vale mais que o arquivo órfão).
   */
  private async removeAvatars({
    retention,
    photoStorage,
  }: ClinicRetentionServices): Promise<void> {
    for (const key of await retention.findInactiveAvatarKeys(
      this.cutoffs.inactiveAccount,
    )) {
      try {
        await photoStorage.remove(key);
      } catch (error) {
        logError(`Retenção: falha ao apagar o avatar ${key}`, error);
      }
    }
  }

  /**
   * Apaga o arquivo antes de marcar a foto: se o armazenamento falhar, ela
   * segue pendente e volta na próxima execução.
   */
  private async removePhotos({
    retention,
    photoStorage,
  }: ClinicRetentionServices): Promise<number> {
    let removed = 0;
    for (const photo of await retention.findPendingPhotos(PHOTO_BATCH)) {
      try {
        await photoStorage.remove(photo.id);
        await retention.markPhotoAnonymized(photo.id, this.now);
        removed += 1;
      } catch (error) {
        logError(`Retenção: falha ao apagar a foto ${photo.id}`, error);
      }
    }
    return removed;
  }

  /**
   * Apaga no Google Agenda os eventos das consultas de paciente anonimizado e
   * só então limpa o id (#311). Falha — da credencial ou de um evento — fica no
   * log e o id continua, para a próxima execução tentar de novo. Gateway nulo
   * não apagou nada, então nada é limpo.
   */
  private async removeCalendarEvents({
    retention,
    calendar,
  }: ClinicRetentionServices): Promise<number> {
    let gateway: CalendarGateway;
    try {
      gateway = await resolveCalendarGateway(calendar);
    } catch (error) {
      logError('Retenção: falha ao resolver o Google Agenda', error);
      return 0;
    }
    if (gateway instanceof NullCalendarGateway) return 0;
    let removed = 0;
    for (const event of await retention.findPendingCalendarEvents(
      CALENDAR_BATCH,
    )) {
      try {
        await gateway.purgeEvent(event.googleEventId);
        await retention.markCalendarEventRemoved(event.appointmentId);
        removed += 1;
      } catch (error) {
        logError(
          `Retenção: falha ao apagar o evento da consulta ${event.appointmentId}`,
          error,
        );
      }
    }
    return removed;
  }

  /**
   * Trilha de plataforma (eventos sem empresa). Grava um evento a cada execução,
   * mesmo sem nada vencido (#323): é o registro de que o job rodou, com quantas
   * empresas falharam e o corte usado na trilha. A trilha de cada clínica só
   * ganha evento quando algo mudou nela (RET-09).
   */
  private async runPlatform(
    clinics: ClinicRetentionSummary[],
  ): Promise<RetentionRunSummary['platform']> {
    try {
      const services = await this.platformServices();
      const auditEvents = await services.retention.anonymizeAuditEvents(
        this.cutoffs.auditTrail,
      );
      await services.auditEvents.save(
        this.runEvent(null, {
          ...ZERO,
          auditEvents,
          clinics: clinics.length,
          failedClinics: clinics.filter((clinic) => clinic.error).length,
          auditTrailCutoff: this.cutoffs.auditTrail.toISOString(),
        }),
      );
      return { auditEvents };
    } catch (error) {
      logError('Retenção da trilha de plataforma: falha', error);
      return { auditEvents: 0, error: PLATFORM_RETENTION_FAILED };
    }
  }

  /** Evento só com as contagens (nada de PII), e só se algo mudou. */
  private async recordRun(
    auditEvents: AuditEventRepository,
    clinicId: string,
    counts: RetentionCounts,
  ): Promise<void> {
    if (Object.values(counts).every((count) => count === 0)) return;
    await auditEvents.save(this.runEvent(clinicId, counts));
  }

  private runEvent(clinicId: string | null, detail: object): AuditEvent {
    return AuditEvent.create({
      clinicId,
      actorRole: 'system',
      actorId: RETENTION_ACTOR,
      action: 'update',
      resourceType: 'retention',
      resourceId: this.now.toISOString().slice(0, 10),
      detail: JSON.stringify(detail),
    });
  }
}
