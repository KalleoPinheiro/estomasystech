import type { PatientRepository } from '@/domain/patient/patient-repository';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { AppointmentRepository } from '@/domain/scheduling/appointment-repository';
import { NotFoundError } from '@/domain/shared/errors';

/**
 * Consulta do paciente autenticado. Escopo forçado pela sessão: consulta de
 * outro paciente responde NotFound, sem vazar que ela existe.
 */
export async function findOwnAppointment(
  patients: PatientRepository,
  appointments: AppointmentRepository,
  email: string,
  appointmentId: string,
): Promise<Appointment> {
  const patient = await patients.findByEmail(email);
  if (!patient?.isActive) {
    throw new NotFoundError('Paciente', email);
  }
  const appointment = await appointments.findById(appointmentId);
  if (!appointment || appointment.patientId !== patient.id) {
    throw new NotFoundError('Consulta', appointmentId);
  }
  return appointment;
}
