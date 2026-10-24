/**
 * Fuso das regras da aplicação (#205): grade da agenda, "amanhã" dos lembretes
 * e horário em e-mails e documentos são avaliados em `APP_TIMEZONE`, não no
 * fuso do processo Node — um deploy sem `TZ` (PaaS, imagem sem compose)
 * deslocava tudo em 3h. Fuso por empresa é decisão de produto em aberto.
 */
export const DEFAULT_APP_TIMEZONE = 'America/Sao_Paulo';

export function appTimeZone(): string {
  // No navegador só `NEXT_PUBLIC_APP_TIMEZONE` existe (embutida no build por
  // `next.config.ts` a partir de `APP_TIMEZONE`): servidor e cliente leem o
  // mesmo fuso e renderizam a mesma data (#543).
  const configured =
    typeof process === 'undefined'
      ? undefined
      : (process.env?.APP_TIMEZONE ?? process.env.NEXT_PUBLIC_APP_TIMEZONE);
  return configured?.trim() || DEFAULT_APP_TIMEZONE;
}

/** `true` quando `timeZone` é um identificador IANA que o `Intl` conhece. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  /** 0 = domingo … 6 = sábado (mesma convenção de `Date#getDay`). */
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Data/hora de parede de `date` no fuso informado. */
export function zonedParts(
  date: Date,
  timeZone: string = appTimeZone(),
): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS.indexOf(parts.weekday),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Diferença (ms) entre a hora de parede no fuso e o UTC, no instante dado. */
function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(new Date(instant), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/**
 * Instante em que o relógio de parede do fuso marca `year-month-day hour:minute`.
 * Campos fora do intervalo normalizam como em `Date.UTC` (mês 13 = janeiro).
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  timeZone: string = appTimeZone(),
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  // Recalcula no instante encontrado (virada de horário de verão).
  return new Date(guess - offsetMs(first, timeZone));
}

/** Instante da meia-noite local de `year-month-day` no fuso. */
export function startOfZonedDay(
  year: number,
  month: number,
  day: number,
  timeZone: string = appTimeZone(),
): Date {
  return zonedInstant(year, month, day, 0, 0, timeZone);
}

/** Meia-noite do dia seguinte (ou de `days` dias à frente) ao de `date`, no fuso. */
export function startOfZonedDayAfter(
  date: Date,
  days = 1,
  timeZone: string = appTimeZone(),
): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  return startOfZonedDay(year, month, day + days, timeZone);
}

/** Primeiro instante do mês `month` (1–12) do fuso; `month` fora do intervalo normaliza. */
export function startOfZonedMonth(
  year: number,
  month: number,
  timeZone: string = appTimeZone(),
): Date {
  return startOfZonedDay(year, month, 1, timeZone);
}

/** Primeiro instante do mês de `date` no fuso. */
export function startOfZonedMonthOf(
  date: Date,
  timeZone: string = appTimeZone(),
): Date {
  const { year, month } = zonedParts(date, timeZone);
  return startOfZonedMonth(year, month, timeZone);
}

/** `AAAA-MM` do mês de `date` no fuso, deslocado `monthDelta` meses. */
export function zonedMonthKey(
  date: Date,
  monthDelta = 0,
  timeZone: string = appTimeZone(),
): string {
  const { year, month } = zonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(year, month - 1 + monthDelta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Chave `AAAA-MM-DD` do dia de `date` no fuso. */
export function zonedDateKey(
  date: Date,
  timeZone: string = appTimeZone(),
): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** O mesmo relógio de parede de `date`, `months` meses antes (ou depois, se negativo), no fuso. */
export function shiftZonedMonths(
  date: Date,
  months: number,
  timeZone: string = appTimeZone(),
): Date {
  const { year, month, day, hour, minute } = zonedParts(date, timeZone);
  return zonedInstant(year, month + months, day, hour, minute, timeZone);
}
