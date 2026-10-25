import type { ScheduleConfig } from '@/domain/scheduling/schedule-config';
import { clinicDayCell } from '@/lib/clinic-calendar';

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
  // "Hoje" é o dia da clínica, não o do aparelho (#563).
  const today = clinicDayCell();
  const compare = new Date(day);
  compare.setHours(0, 0, 0, 0);
  return compare < today || !config.weekdays.includes(day.getDay());
}
