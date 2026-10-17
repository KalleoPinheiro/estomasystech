import { RescheduleAppointment } from '@/application/appointments/reschedule-appointment';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import {
  assertPatientCanChange,
  assertWithinPortalHorizon,
} from '@/domain/scheduling/patient-self-service';
import type { ScheduleAvailabilityRepository } from '@/domain/scheduling/schedule-availability';
import {
  cancellationPolicyOf,
  type ScheduleConfigRepository,
} from '@/domain/scheduling/schedule-config';
import { ValidationError } from '@/domain/shared/errors';
import { findOwnAppointment } from './own-appointment';

export const PROFESSIONAL_UNAVAILABLE_MESSAGE =
  'O profissional desta consulta não está mais disponível. Entre em contato com a clínica para remarcar.';

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
    /** Barra remarcar consulta cujo profissional está inativo ou sumiu (AD-040). */
    private readonly professionals?: ProfessionalRepository,
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
    await this.assertProfessionalActive(appointment);

    if (input.startsAt.getTime() <= now.getTime()) {
      throw new ValidationError('Escolha um horário futuro para a consulta');
    }
    // Remarcar não cria consulta (o teto não muda), mas o horizonte vale (#213).
    assertWithinPortalHorizon(input.startsAt, now);

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

  /**
   * Consulta sem profissional ativo seria atendimento fantasma: o paciente não
   * escolhe quem atende, então a saída é falar com a clínica (AD-040).
   */
  private async assertProfessionalActive(
    appointment: Appointment,
  ): Promise<void> {
    if (!appointment.professionalId || !this.professionals) return;
    const professional = await this.professionals.findById(
      appointment.professionalId,
    );
    if (!professional?.isActive) {
      throw new ValidationError(PROFESSIONAL_UNAVAILABLE_MESSAGE);
    }
  }
}
