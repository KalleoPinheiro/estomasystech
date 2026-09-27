import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { assertPatientCanChange } from '@/domain/scheduling/patient-self-service';
import {
  cancellationPolicyOf,
  type ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import { findOwnAppointment } from './own-appointment';

export interface CancelOwnAppointmentResult {
  appointment: Appointment;
  /** false quando a consulta já estava cancelada pelo paciente (repetição). */
  changed: boolean;
}

export interface CancelOwnAppointmentInput {
  /** Email da sessão — define o paciente, nunca vem do corpo da requisição. */
  /** Titular resolvido pelo vínculo da conta de portal (#196). */
  patientId: string;
  appointmentId: string;
  reason?: string | null;
  now?: Date;
}

/**
 * Cancelamento pelo próprio paciente (portal). Só consulta ativa e com a
 * antecedência mínima; o cancelamento fica registrado como do paciente, para
 * a equipe e o próprio portal distinguirem de um cancelamento da clínica.
 */
export class CancelOwnAppointment {
  constructor(
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly scheduleConfig?: ScheduleConfigRepository,
  ) {}

  async execute(
    input: CancelOwnAppointmentInput,
  ): Promise<CancelOwnAppointmentResult> {
    const appointment = await findOwnAppointment(
      this.patients,
      this.appointments,
      input.patientId,
      input.appointmentId,
    );
    // Duplo clique ou nova aba: repetir o cancelamento não é erro.
    if (appointment.cancellation?.by === 'patient') {
      return { appointment, changed: false };
    }

    const now = input.now ?? new Date();
    const policy = cancellationPolicyOf(await this.scheduleConfig?.get());
    assertPatientCanChange(appointment, now, policy.noticeHours);

    const cancelled = appointment.cancel({
      by: 'patient',
      at: now,
      reason: input.reason ?? null,
    });
    await this.appointments.save(cancelled);
    return { appointment: cancelled, changed: true };
  }
}
