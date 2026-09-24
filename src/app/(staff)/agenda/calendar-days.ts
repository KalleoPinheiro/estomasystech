import type { ScheduleConfig } from '@/domain/scheduling/schedule-config';

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function buildMonthDays(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

/** Dia inválido = passado ou fora dos dias configurados (AGENDA-01). */
export function isInvalidDay(day: Date, config: ScheduleConfig): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(day);
  compare.setHours(0, 0, 0, 0);
  return compare < today || !config.weekdays.includes(day.getDay());
}
