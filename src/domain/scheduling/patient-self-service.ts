import { ValidationError } from '../shared/errors';
import type { Appointment } from './appointment';

/**
 * Antecedência mínima para o paciente cancelar ou remarcar pelo portal.
 * Dentro dela a mudança passa pela recepção, que decide caso a caso — um
 * horário liberado em cima da hora dificilmente é reaproveitado.
 */
export const PATIENT_CHANGE_MIN_NOTICE_HOURS = 24;

const HOUR_MS = 3_600_000;

/** Até quando (exclusivo) o paciente ainda pode mudar esta consulta sozinho. */
export function patientChangeDeadline(startsAt: Date): Date {
  return new Date(
    startsAt.getTime() - PATIENT_CHANGE_MIN_NOTICE_HOURS * HOUR_MS,
  );
}

/** Consulta ativa, futura e fora da antecedência mínima. */
export function canPatientChange(appointment: Appointment, now: Date): boolean {
  return (
    appointment.isActive &&
    now.getTime() <= patientChangeDeadline(appointment.slot.start).getTime()
  );
}

export function assertPatientCanChange(
  appointment: Appointment,
  now: Date,
): void {
  if (!appointment.isActive) {
    throw new ValidationError(
      'Esta consulta não está mais ativa e não pode ser alterada',
    );
  }
  if (!canPatientChange(appointment, now)) {
    throw new ValidationError(
      `Faltam menos de ${PATIENT_CHANGE_MIN_NOTICE_HOURS} horas para a consulta: para cancelar ou remarcar, fale com a clínica`,
    );
  }
}
