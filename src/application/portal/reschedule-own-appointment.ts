import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { assertPatientCanChange } from '@/domain/scheduling/patient-self-service';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import {
  cancellationPolicyOf,
  type ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import { ValidationError } from '@/domain/shared/errors';
import { findOwnAppointment } from './own-appointment';

export interface RescheduleOwnAppointmentInput {
  /** Email da sessão — define o paciente, nunca vem do corpo da requisição. */
  /** Titular resolvido pelo vínculo da conta de portal (#196). */
  patientId: string;
  appointmentId: string;
  startsAt: Date;
  now?: Date;
}

/**
 * Remarcação pelo próprio paciente (portal). Mantém procedimento, preço,
 * profissional e duração — o paciente só escolhe outro horário, validado pela
 * mesma regra de disponibilidade da equipe (`RescheduleAppointment`).
 */
export class RescheduleOwnAppointment {
  constructor(
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
    private readonly scheduleConfig?: ScheduleConfigRepository,
    private readonly availability?: ScheduleAvailabilityRepository,
  ) {}

  async execute(input: RescheduleOwnAppointmentInput): Promise<Appointment> {
    const appointment = await findOwnAppointment(
      this.patients,
      this.appointments,
      input.patientId,
      input.appointmentId,
    );
    const now = input.now ?? new Date();
    const policy = cancellationPolicyOf(await this.scheduleConfig?.get());
    assertPatientCanChange(appointment, now, policy.noticeHours);

    if (input.startsAt.getTime() <= now.getTime()) {
      throw new ValidationError('Escolha um horário futuro para a consulta');
    }

    const durationMs =
      appointment.slot.end.getTime() - appointment.slot.start.getTime();
    return new RescheduleAppointment(
      this.appointments,
      this.scheduleConfig,
      this.availability,
    ).execute({
      id: appointment.id,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + durationMs),
    });
  }
}
