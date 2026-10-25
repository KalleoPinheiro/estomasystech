import type { EmailGateway } from '@/application/ports/email-gateway';
import type { ClinicStatus } from '@/domain/clinic/clinic';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
import type { Guardian } from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { dueRecallAttempt } from '@/domain/messaging/recall-cadence';
import {
  firstNameOf,
  type ReminderContent,
  reminderContent,
} from '@/domain/messaging/reminder-content';
import {
  dateKey,
  type ReminderKind,
  ReminderLog,
  type ReminderLogRepository,
} from '@/domain/messaging/reminder-log';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { startOfZonedDay, zonedParts } from '@/domain/shared/time-zone';
import { logError } from '@/lib/log-error';
import { recordSignal } from '@/lib/observability/signals';
import { portalUrlFromEnv } from './portal-url';

/** Canal de e-mail da clínica no disparo (C2, #265). */
export type ReminderChannelState = 'configured' | 'none';

export interface ClinicReminderSummary {
  clinicId: string;
  /** Ausente só quando a empresa não pôde ser processada (`error`). */
  channel?: ReminderChannelState;
  sent: number;
  skipped: number;
  failed: number;
  /** Presente quando a empresa não pôde ser processada; contadores zerados. */
  error?: string;
}

export interface ReminderRunSummary {
  sent: number;
  skipped: number;
  failed: number;
  clinics: ClinicReminderSummary[];
}

/**
 * Repositórios de UMA empresa (`clinicScope(id)`). `email` é o canal da
 * própria clínica (ADR-011): sem canal, os lembretes dela não saem.
 */
export interface ClinicReminderServices {
  email: EmailGateway;
  appointments: AppointmentRepository;
  followUps: FollowUpRepository;
  guardians: GuardianRepository;
  patients: PatientRepository;
  reminderLog: ReminderLogRepository;
}

export interface ReminderClinic {
  id: string;
  name: string;
  /** Clínica `suspended` (B5) não recebe lembretes; ausente = `active`. */
  status?: ClinicStatus;
}

interface PendingReminder {
  kind: ReminderKind;
  referenceId: string;
  patientId: string;
  attempt: number;
  content: (greeting: ReminderGreeting) => ReminderContent;
}

/** Quem recebe o e-mail e, quando é o responsável, de quem se fala (#329). */
interface ReminderGreeting {
  firstName: string;
  onBehalfOf?: string;
}

interface ReminderRecipient {
  email: string;
  greeting: ReminderGreeting;
}

/**
 * Job de lembretes por e-mail, empresa a empresa, cada uma pelo próprio canal:
 * confirmação D-1 (consultas de amanhã ainda "scheduled") e recall de retornos
 * vencidos na cadência D+1/D+7/D+30. Falha de envio individual não aborta o lote; falha ao ler uma
 * empresa não impede as demais. Clínica suspensa é ignorada.
 */
export class SendReminders {
  constructor(
    private readonly clinics: readonly ReminderClinic[],
    private readonly servicesFor: (
      clinicId: string,
    ) => Promise<ClinicReminderServices>,
  ) {}

  async execute(now: Date = new Date()): Promise<ReminderRunSummary> {
    const summary: ReminderRunSummary = {
      sent: 0,
      skipped: 0,
      failed: 0,
      clinics: [],
    };
    // Clínica suspensa (B5) fica fora do lote: nem o escopo dela é aberto, e
    // ela volta no primeiro disparo depois da reativação.
    const active = this.clinics.filter(
      (clinic) => clinic.status !== 'suspended',
    );
    for (const clinic of active) {
      const result = await this.runClinic(clinic, now);
      summary.sent += result.sent;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
      summary.clinics.push(result);
    }
    return summary;
  }

  private async runClinic(
    clinic: ReminderClinic,
    now: Date,
  ): Promise<ClinicReminderSummary> {
    try {
      const services = await this.servicesFor(clinic.id);
      return await new ClinicReminders(clinic, services).run(now);
    } catch (error) {
      logError(`Lembretes da empresa ${clinic.id}: falha`, error);
      return {
        clinicId: clinic.id,
        sent: 0,
        skipped: 0,
        failed: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * O e-mail do paciente vale sempre; sem ele, o do responsável ligado a ele
 * (#329), que recebe o aviso em nome do paciente.
 */
const recipientFor = (
  patient: Patient,
  guardiansById: ReadonlyMap<string, Guardian>,
): ReminderRecipient | null => {
  const firstName = firstNameOf(patient.fullName);
  if (patient.email) {
    return { email: patient.email, greeting: { firstName } };
  }
  const guardian = patient.guardianId
    ? guardiansById.get(patient.guardianId)
    : undefined;
  if (!guardian?.email) return null;
  return {
    email: guardian.email,
    greeting: {
      firstName: firstNameOf(guardian.fullName),
      onBehalfOf: firstName,
    },
  };
};

class ClinicReminders {
  private readonly portalUrl = portalUrlFromEnv();

  constructor(
    private readonly clinic: ReminderClinic,
    private readonly services: ClinicReminderServices,
  ) {}

  async run(now: Date): Promise<ClinicReminderSummary> {
    const channel: ReminderChannelState =
      (await this.services.email.isEnabled()) ? 'configured' : 'none';
    const pending = [
      ...(await this.confirmationReminders(now)),
      ...(await this.recallReminders(now)),
    ];
    const patientsById = new Map(
      (
        await this.services.patients.findByIds(pending.map((r) => r.patientId))
      ).map((p) => [p.id, p]),
    );
    const guardiansById = await this.loadGuardians([...patientsById.values()]);

    const summary: ClinicReminderSummary = {
      clinicId: this.clinic.id,
      channel,
      sent: 0,
      skipped: 0,
      failed: 0,
    };
    for (const reminder of pending) {
      const patient = patientsById.get(reminder.patientId);
      const recipient = patient?.isActive
        ? recipientFor(patient, guardiansById)
        : null;
      // Sem e-mail do paciente nem do responsável (#325, #329): pula sem erro.
      if (!recipient) {
        summary.skipped += 1;
        continue;
      }
      const content = reminder.content(recipient.greeting);
      const outcome = await this.deliver(
        reminder,
        recipient.email,
        content,
        now,
        channel,
      );
      summary[outcome] += 1;
    }
    return summary;
  }

  /** Responsáveis dos pacientes sem e-mail próprio, em uma só consulta. */
  private async loadGuardians(
    patients: readonly Patient[],
  ): Promise<Map<string, Guardian>> {
    const ids = patients
      .filter((p) => p.isActive && !p.email && p.guardianId)
      .map((p) => p.guardianId as string);
    const guardians = await this.services.guardians.findByIds(ids);
    return new Map(guardians.map((g) => [g.id, g]));
  }

  private async deliver(
    reminder: PendingReminder,
    to: string,
    content: ReminderContent,
    now: Date,
    channel: ReminderChannelState,
  ): Promise<'sent' | 'skipped' | 'failed'> {
    const message = { to, subject: content.subject, text: content.text };
    if (channel === 'none') {
      // Clínica sem canal: loga o que enviaria (dry-run) e não marca como
      // enviado. Nunca cai na conta da plataforma (ADR-011).
      await this.services.email.send(message);
      return 'skipped';
    }
    try {
      await this.services.email.send(message);
    } catch (error) {
      logError(
        `Lembrete ${reminder.kind}/${reminder.referenceId}: falha no envio`,
        error,
      );
      recordSignal('delivery-failure');
      return 'failed';
    }
    await this.services.reminderLog.save(
      ReminderLog.create(reminder.kind, reminder.referenceId, now, {
        channel: 'email',
        attempt: reminder.attempt,
      }),
    );
    return 'sent';
  }

  private async confirmationReminders(now: Date): Promise<PendingReminder[]> {
    // "Amanhã" no fuso da aplicação (#205), não no do processo.
    const today = zonedParts(now);
    const startOfTomorrow = startOfZonedDay(
      today.year,
      today.month,
      today.day + 1,
    );
    const endOfTomorrow = startOfZonedDay(
      today.year,
      today.month,
      today.day + 2,
    );
    const appointments = await this.services.appointments.findInRange(
      startOfTomorrow,
      endOfTomorrow,
    );
    const scheduled = appointments.filter((a) => a.status === 'scheduled');
    const alreadySent = await this.services.reminderLog.sentReferences(
      'confirmation',
      'email',
      scheduled.map((a) => a.id),
      dateKey(now),
    );

    const reminders: PendingReminder[] = [];
    for (const appointment of scheduled) {
      if (alreadySent.has(appointment.id)) continue;
      reminders.push({
        kind: 'confirmation',
        referenceId: appointment.id,
        patientId: appointment.patientId,
        attempt: 1,
        content: (greeting) =>
          reminderContent('confirmation', {
            ...greeting,
            clinicName: this.clinic.name,
            portalUrl: greeting.onBehalfOf ? null : this.portalUrl,
            startsAt: appointment.slot.start,
          }),
      });
    }
    return reminders;
  }

  private async recallReminders(now: Date): Promise<PendingReminder[]> {
    const { year, month, day } = zonedParts(now);
    const startOfToday = startOfZonedDay(year, month, day);
    const overdue =
      await this.services.followUps.findPendingDueBefore(startOfToday);

    const lastAttempts = await this.services.reminderLog.lastRecallAttempts(
      overdue.map((f) => f.id),
    );

    const reminders: PendingReminder[] = [];
    for (const followUp of overdue) {
      const attempt = dueRecallAttempt(
        followUp.dueDate,
        now,
        lastAttempts.get(followUp.id) ?? 0,
      );
      if (attempt === null) continue;
      reminders.push({
        kind: 'recall',
        referenceId: followUp.id,
        patientId: followUp.patientId,
        attempt,
        content: (greeting) =>
          reminderContent('recall', {
            ...greeting,
            clinicName: this.clinic.name,
            portalUrl: greeting.onBehalfOf ? null : this.portalUrl,
            dueDate: followUp.dueDate,
          }),
      });
    }
    return reminders;
  }
}
