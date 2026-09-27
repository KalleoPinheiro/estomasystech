import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { ValidationError } from '@/domain/shared/errors';
import { findOwnAppointment } from './own-appointment';

export interface ConfirmOwnAppointmentInput {
  /** Titular resolvido pelo vínculo da conta de portal (#196). */
  patientId: string;
  appointmentId: string;
  now?: Date;
}

/**
 * Confirmação de presença pelo próprio paciente (portal).
 * Escopo forçado pela sessão: só confirma consulta do paciente autenticado —
 * consulta de outro paciente responde NotFound (sem vazar existência).
 */
export class ConfirmOwnAppointment {
  constructor(
    private readonly patients: PatientRepository,
    private readonly appointments: AppointmentRepository,
  ) {}

  async execute(input: ConfirmOwnAppointmentInput): Promise<Appointment> {
    const appointment = await findOwnAppointment(
      this.patients,
      this.appointments,
      input.patientId,
      input.appointmentId,
    );

    if (appointment.status === 'confirmed') {
      return appointment;
    }

    const now = input.now ?? new Date();
    if (appointment.slot.start.getTime() <= now.getTime()) {
      throw new ValidationError('Só é possível confirmar consultas futuras');
    }

    const confirmed = appointment.confirm();
    await this.appointments.save(confirmed);
    return confirmed;
  }
}
