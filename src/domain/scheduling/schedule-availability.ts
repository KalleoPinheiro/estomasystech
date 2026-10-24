import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import type { TimeSlot } from '../shared/time-slot';
import { appTimeZone, zonedDateKey, zonedParts } from '../shared/time-zone';
import { formatMinuteOfDay } from './schedule-config';

/**
 * Dia sem atendimento: feriado ou recesso da clínica (`professionalId` nulo)
 * ou ausência de um profissional (férias, congresso). Datas locais AAAA-MM-DD,
 * inclusivas.
 */
export interface ScheduleClosure {
  id: string;
  professionalId: string | null;
  startsOn: string;
  endsOn: string;
  reason: string;
  createdAt: Date;
}

export interface NewScheduleClosure {
  professionalId?: string | null;
  startsOn: string;
  endsOn?: string | null;
  reason: string;
}

/**
 * Janela semanal de atendimento de um profissional, em minutos desde 00:00.
 * Profissional sem janela nenhuma segue só a grade da clínica.
 */
export interface WeeklyWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

const MAX_REASON_LENGTH = 200;
const MAX_CLOSURE_DAYS = 366;
const DAY_MS = 86_400_000;
const WEEKDAY_NAMES = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

/** Data AAAA-MM-DD de um instante no fuso da clínica (#563), não no do processo. */
export function localDateKey(
  date: Date,
  timeZone: string = appTimeZone(),
): string {
  return zonedDateKey(date, timeZone);
}

function parseDateKey(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  return parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? time
    : null;
}

/** "2026-12-25" → "25/12/2026". */
export function formatDateKey(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function createScheduleClosure(
  input: NewScheduleClosure,
  now: Date = new Date(),
): ScheduleClosure {
  const endsOn = input.endsOn || input.startsOn;
  const start = parseDateKey(input.startsOn);
  const end = parseDateKey(endsOn);
  if (start === null || end === null) {
    throw new ValidationError('Datas do bloqueio devem estar em AAAA-MM-DD');
  }
  if (end < start) {
    throw new ValidationError('O bloqueio não pode terminar antes de começar');
  }
  if ((end - start) / DAY_MS + 1 > MAX_CLOSURE_DAYS) {
    throw new ValidationError(
      `Um bloqueio pode durar no máximo ${MAX_CLOSURE_DAYS} dias`,
    );
  }
  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > MAX_REASON_LENGTH) {
    throw new ValidationError(
      `Motivo do bloqueio é obrigatório (até ${MAX_REASON_LENGTH} caracteres)`,
    );
  }
  return {
    id: newId(),
    professionalId: input.professionalId ?? null,
    startsOn: input.startsOn,
    endsOn,
    reason,
    createdAt: now,
  };
}

export function closureCovers(closure: ScheduleClosure, day: string): boolean {
  return closure.startsOn <= day && day <= closure.endsOn;
}

/**
 * Bloqueios que impedem o horário: os da clínica sempre; os de um
 * profissional só quando a consulta é dele.
 */
export function assertNotClosed(
  slot: TimeSlot,
  closures: readonly ScheduleClosure[],
  professionalId: string | null,
): void {
  const day = localDateKey(slot.start);
  const blocking = closures.find(
    (closure) =>
      closureCovers(closure, day) &&
      (closure.professionalId === null ||
        closure.professionalId === professionalId),
  );
  if (blocking) {
    const who =
      blocking.professionalId === null
        ? 'Clínica fechada'
        : 'Profissional ausente';
    throw new ValidationError(
      `${who} em ${formatDateKey(day)}: ${blocking.reason}`,
    );
  }
}

export function validateWeeklyWindows(
  windows: readonly WeeklyWindow[],
): WeeklyWindow[] {
  const sorted = [...windows].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
  );
  sorted.forEach((window, index) => {
    const valid =
      Number.isInteger(window.weekday) &&
      window.weekday >= 0 &&
      window.weekday <= 6 &&
      Number.isInteger(window.startMinute) &&
      Number.isInteger(window.endMinute) &&
      window.startMinute >= 0 &&
      window.endMinute <= 24 * 60 &&
      window.startMinute < window.endMinute;
    if (!valid) {
      throw new ValidationError(
        'Cada janela precisa de dia da semana e início antes do fim (00:00–24:00)',
      );
    }
    const previous = sorted[index - 1];
    if (
      previous &&
      previous.weekday === window.weekday &&
      previous.endMinute > window.startMinute
    ) {
      throw new ValidationError(
        `Janelas sobrepostas na ${WEEKDAY_NAMES[window.weekday]}`,
      );
    }
  });
  return sorted.map(({ weekday, startMinute, endMinute }) => ({
    weekday,
    startMinute,
    endMinute,
  }));
}

export function describeWeeklyWindows(
  windows: readonly WeeklyWindow[],
): string {
  return windows
    .map(
      (w) =>
        `${WEEKDAY_NAMES[w.weekday]} ${formatMinuteOfDay(w.startMinute)}–${formatMinuteOfDay(w.endMinute)}`,
    )
    .join(', ');
}

/** Horário precisa caber inteiro numa janela do profissional (se ele tiver janelas). */
export function assertWithinProfessionalHours(
  slot: TimeSlot,
  windows: readonly WeeklyWindow[],
  timeZone: string = appTimeZone(),
): void {
  if (windows.length === 0) {
    return;
  }
  const from = zonedParts(slot.start, timeZone);
  const to = zonedParts(slot.end, timeZone);
  const weekday = from.weekday;
  const start = from.hour * 60 + from.minute;
  const end = to.hour * 60 + to.minute || 24 * 60;
  const fits = windows.some(
    (w) =>
      w.weekday === weekday && w.startMinute <= start && end <= w.endMinute,
  );
  if (!fits) {
    throw new ValidationError(
      `Fora do horário do profissional: ${describeWeeklyWindows(windows)}`,
    );
  }
}

export interface ScheduleAvailabilityRepository {
  /** Bloqueios que tocam o intervalo de datas (inclusivo), da clínica e de todos os profissionais. */
  listClosures(range: { from: string; to: string }): Promise<ScheduleClosure[]>;
  findClosureById(id: string): Promise<ScheduleClosure | null>;
  saveClosure(closure: ScheduleClosure): Promise<void>;
  deleteClosure(id: string): Promise<void>;
  getProfessionalHours(professionalId: string): Promise<WeeklyWindow[]>;
  replaceProfessionalHours(
    professionalId: string,
    windows: readonly WeeklyWindow[],
  ): Promise<void>;
}
