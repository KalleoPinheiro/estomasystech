import { ValidationError } from '../shared/errors';
import type { TimeSlot } from '../shared/time-slot';
import { appTimeZone, zonedParts } from '../shared/time-zone';
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

  const sameDay =
    start.year === end.year &&
    start.month === end.month &&
    start.day === end.day;
  if (!sameDay || !config.weekdays.includes(start.weekday)) {
    throw new ValidationError(message);
  }
  const opensAt = config.startHour * 60;
  const closesAt = config.endHour * 60;
  const startMinute = start.hour * 60 + start.minute;
  const endMinute = end.hour * 60 + end.minute;
  if (startMinute < opensAt || endMinute > closesAt) {
    throw new ValidationError(message);
  }
  const lunch = config.lunchBreak;
  if (lunch && startMinute < lunch.endMinute && lunch.startMinute < endMinute) {
    throw new ValidationError(message);
  }
}
