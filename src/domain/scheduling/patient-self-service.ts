import { ValidationError } from '../shared/errors';
import type { Appointment } from './appointment';
import { DEFAULT_CANCELLATION_POLICY } from './schedule-config';

/**
 * Antecedência mínima padrão para o paciente cancelar ou remarcar pelo
 * portal — cada clínica ajusta na política de cancelamento.
 * Dentro dela a mudança passa pela recepção, que decide caso a caso — um
 * horário liberado em cima da hora dificilmente é reaproveitado.
 */
export const PATIENT_CHANGE_MIN_NOTICE_HOURS =
  DEFAULT_CANCELLATION_POLICY.noticeHours;

const HOUR_MS = 3_600_000;

/** Até quando (exclusivo) o paciente ainda pode mudar esta consulta sozinho. */
export function patientChangeDeadline(
  startsAt: Date,
  noticeHours: number = PATIENT_CHANGE_MIN_NOTICE_HOURS,
): Date {
  return new Date(startsAt.getTime() - noticeHours * HOUR_MS);
}

/** Consulta ativa, futura e fora da antecedência mínima. */
export function canPatientChange(
  appointment: Appointment,
  now: Date,
  noticeHours: number = PATIENT_CHANGE_MIN_NOTICE_HOURS,
): boolean {
  return (
    appointment.isActive &&
    now.getTime() <=
      patientChangeDeadline(appointment.slot.start, noticeHours).getTime()
  );
}

export function assertPatientCanChange(
  appointment: Appointment,
  now: Date,
  noticeHours: number = PATIENT_CHANGE_MIN_NOTICE_HOURS,
): void {
  if (!appointment.isActive) {
    throw new ValidationError(
      'Esta consulta não está mais ativa e não pode ser alterada',
    );
  }
  if (!canPatientChange(appointment, now, noticeHours)) {
    throw new ValidationError(
      `Faltam menos de ${noticeHours} horas para a consulta: para cancelar ou remarcar, fale com a clínica`,
    );
  }
}
