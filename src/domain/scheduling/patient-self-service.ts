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

/** Teto de consultas futuras que o paciente mantém marcadas pelo portal (#213). */
export const PORTAL_MAX_FUTURE_APPOINTMENTS = 2;

/** Até quantos dias à frente o paciente agenda ou remarca sozinho (#213). */
export const PORTAL_BOOKING_HORIZON_DAYS = 60;

const DAY_MS = 86_400_000;

/** Último instante em que o paciente pode marcar pelo portal. */
export function portalBookingHorizon(now: Date): Date {
  return new Date(now.getTime() + PORTAL_BOOKING_HORIZON_DAYS * DAY_MS);
}

export const PORTAL_HORIZON_MESSAGE = `Só é possível agendar pelo portal em até ${PORTAL_BOOKING_HORIZON_DAYS} dias: escolha uma data mais próxima ou fale com a clínica`;

export function assertWithinPortalHorizon(at: Date, now: Date): void {
  if (at.getTime() > portalBookingHorizon(now).getTime()) {
    throw new ValidationError(PORTAL_HORIZON_MESSAGE);
  }
}

/**
 * Consultas futuras ativas do paciente, qualquer que seja a origem do
 * agendamento: o teto protege a agenda da clínica, não importa quem marcou.
 */
export function assertUnderPortalFutureCap(
  appointments: readonly Appointment[],
  now: Date,
): void {
  const future = appointments.filter(
    (appointment) =>
      appointment.isActive && appointment.slot.start.getTime() > now.getTime(),
  );
  if (future.length >= PORTAL_MAX_FUTURE_APPOINTMENTS) {
    throw new ValidationError(
      `Você já tem ${PORTAL_MAX_FUTURE_APPOINTMENTS} consultas futuras marcadas: cancele ou aguarde uma delas, ou fale com a clínica para marcar outra`,
    );
  }
}
