import { dateKey } from './reminder-log';

/** Dias após o vencimento em que sai cada tentativa: D+1, D+7, D+30. */
export const RECALL_ATTEMPT_DAYS = [1, 7, 30] as const;
export const MAX_RECALL_ATTEMPTS = RECALL_ATTEMPT_DAYS.length;

const DAY_MS = 86_400_000;

const dayNumber = (day: string): number => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date) / DAY_MS;
};

/** Dias de calendário, no fuso `TZ`, entre o vencimento e agora. */
export const daysSinceDue = (dueDate: Date, now: Date): number =>
  dayNumber(dateKey(now)) - dayNumber(dateKey(dueDate));

/**
 * Tentativa de recall que cabe hoje, ou `null`. Sai só a mais alta já cabível:
 * um retorno que passou de várias marcas sem envio recebe uma única mensagem e
 * as anteriores nunca saem depois.
 */
export function dueRecallAttempt(
  dueDate: Date,
  now: Date,
  lastAttempt: number,
): number | null {
  const elapsed = daysSinceDue(dueDate, now);
  const reached = RECALL_ATTEMPT_DAYS.filter((day) => elapsed >= day).length;
  return reached > lastAttempt ? reached : null;
}
