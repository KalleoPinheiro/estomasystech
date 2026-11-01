import { ValidationError } from '../shared/errors';
import type { TimeSlot } from '../shared/time-slot';
import { appTimeZone, type ZonedParts, zonedParts } from '../shared/time-zone';
import {
  DEFAULT_SCHEDULE_CONFIG,
  describeSchedule,
  type ScheduleConfig,
} from './schedule-config';

/** Compatibilidade com telas que exibem a grade padrão. */
export const BUSINESS_HOURS = {
  startHour: DEFAULT_SCHEDULE_CONFIG.startHour,
  endHour: DEFAULT_SCHEDULE_CONFIG.endHour,
  weekDays: 'segunda a sexta',
} as const;

export const MIN_GAP_MINUTES = DEFAULT_SCHEDULE_CONFIG.minGapMinutes;

const MINUTES_PER_DAY = 24 * 60;

/**
 * Minuto do dia, contado do dia de início, em que o horário termina. O fim às
 * 00:00 do dia civil seguinte vale 24:00 (1440); qualquer outro fim em dia
 * diferente do início cruza a meia-noite e devolve `null` (#580).
 */
export function endMinuteOfDay(
  start: ZonedParts,
  end: ZonedParts,
): number | null {
  const endMinute = end.hour * 60 + end.minute;
  const dayDelta =
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
    (MINUTES_PER_DAY * 60_000);
  if (dayDelta === 0) {
    return endMinute;
  }
  return dayDelta === 1 && endMinute === 0 ? MINUTES_PER_DAY : null;
}

/**
 * Valida o slot contra a grade configurada (default = comportamento
 * histórico), na hora de parede do fuso da aplicação (#205) — nunca no fuso
 * do processo.
 */
export function assertWithinBusinessHours(
  slot: TimeSlot,
  config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG,
  timeZone: string = appTimeZone(),
): void {
  const message = `Atendimento somente em: ${describeSchedule(config)}`;
  const start = zonedParts(slot.start, timeZone);
  const end = zonedParts(slot.end, timeZone);

  const endMinute = endMinuteOfDay(start, end);
  if (endMinute === null || !config.weekdays.includes(start.weekday)) {
    throw new ValidationError(message);
  }
  const opensAt = config.startHour * 60;
  const closesAt = config.endHour * 60;
  const startMinute = start.hour * 60 + start.minute;
  if (startMinute < opensAt || endMinute > closesAt) {
    throw new ValidationError(message);
  }
  const lunch = config.lunchBreak;
  if (lunch && startMinute < lunch.endMinute && lunch.startMinute < endMinute) {
    throw new ValidationError(message);
  }
}
