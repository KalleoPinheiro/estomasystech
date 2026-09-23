import { ValidationError } from '../shared/errors';
import type { TimeSlot } from '../shared/time-slot';
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

const isSameLocalDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const minutesOfDay = (date: Date): number =>
  date.getHours() * 60 + date.getMinutes();

/** Valida o slot contra a grade configurada (default = comportamento histórico). */
export function assertWithinBusinessHours(
  slot: TimeSlot,
  config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG,
): void {
  const message = `Atendimento somente em: ${describeSchedule(config)}`;

  if (!isSameLocalDay(slot.start, slot.end)) {
    throw new ValidationError(message);
  }
  if (!config.weekdays.includes(slot.start.getDay())) {
    throw new ValidationError(message);
  }
  const opensAt = config.startHour * 60;
  const closesAt = config.endHour * 60;
  const startMinute = minutesOfDay(slot.start);
  const endMinute = minutesOfDay(slot.end);
  if (startMinute < opensAt || endMinute > closesAt) {
    throw new ValidationError(message);
  }
  const lunch = config.lunchBreak;
  if (lunch && startMinute < lunch.endMinute && lunch.startMinute < endMinute) {
    throw new ValidationError(message);
  }
}
