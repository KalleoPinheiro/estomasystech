import type { ClinicRepository } from '@/domain/clinic/clinic-repository';
import type { FollowUpRepository } from '@/domain/followup/follow-up-repository';
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
import { whatsappLink } from '@/domain/messaging/whatsapp-link';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { portalUrlFromEnv } from './portal-url';

export interface WhatsAppReminderInput {
  kind: ReminderKind;
  referenceId: string;
  /** Empresa da sessão — dona do registro e do nome no texto. */
  clinicId: string;
  now?: Date;
}

export interface WhatsAppReminderResult {
  url: string;
  /** Primeiro clique do dia para esta referência. */
  sentAt: Date;
}

interface Reference {
  patientId: string;
  content: (
    firstName: string,
    clinicName: string,
    portalUrl: string | null,
  ) => ReminderContent;
}

/**
 * Botão "Enviar WhatsApp" da recepção: monta o link `wa.me` com a mensagem
 * pronta (com procedimento/motivo — quem envia é a própria clínica) e registra
 * o clique em `reminder_logs` (canal `whatsapp_link`, um por dia).
 */
export class SendWhatsAppReminder {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly followUps: FollowUpRepository,
    private readonly patients: PatientRepository,
    private readonly clinics: ClinicRepository,
    private readonly reminderLog: ReminderLogRepository,
  ) {}

  async execute(input: WhatsAppReminderInput): Promise<WhatsAppReminderResult> {
    const now = input.now ?? new Date();
    const reference = await this.resolve(input.kind, input.referenceId);
    const patient = await this.patients.findById(reference.patientId);
    if (!patient) {
      throw new NotFoundError('Paciente', reference.patientId);
    }
    const clinic = await this.clinics.findById(input.clinicId);
    const content = reference.content(
      firstNameOf(patient.fullName),
      clinic?.name ?? 'clínica',
      portalUrlFromEnv(),
    );

    // Link antes do registro: telefone inválido não conta como clique (#324).
    const url = whatsappLink(patient.phone, content.text);

    // Índice único diário + onConflictDoNothing: cliques repetidos ou
    // simultâneos deixam um único registro; o horário é o do primeiro.
    await this.reminderLog.save(
      ReminderLog.create(input.kind, input.referenceId, now, {
        channel: 'whatsapp_link',
      }),
    );
    const firstClicks = await this.reminderLog.firstSentAt(
      input.kind,
      'whatsapp_link',
      [input.referenceId],
      dateKey(now),
    );

    return {
      url,
      sentAt: firstClicks.get(input.referenceId) ?? now,
    };
  }

  private async resolve(
    kind: ReminderKind,
    referenceId: string,
  ): Promise<Reference> {
    if (kind === 'confirmation') {
      const appointment = await this.appointments.findById(referenceId);
      if (!appointment) {
        throw new NotFoundError('Consulta', referenceId);
      }
      return {
        patientId: appointment.patientId,
        content: (firstName, clinicName, portalUrl) =>
          reminderContent('confirmation', {
            firstName,
            clinicName,
            portalUrl,
            startsAt: appointment.slot.start,
            procedure: appointment.procedure,
          }),
      };
    }
    const followUp = await this.followUps.findById(referenceId);
    if (!followUp) {
      throw new NotFoundError('Retorno', referenceId);
    }
    return {
      patientId: followUp.patientId,
      content: (firstName, clinicName, portalUrl) =>
        reminderContent('recall', {
          firstName,
          clinicName,
          portalUrl,
          dueDate: followUp.dueDate,
          reason: followUp.reason,
        }),
    };
  }
}
