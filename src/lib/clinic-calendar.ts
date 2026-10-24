import {
  startOfZonedDay,
  zonedDateKey,
  zonedInstant,
  zonedParts,
} from '@/domain/shared/time-zone';

/**
 * Calendário da clínica no cliente (#563/#543). Dia, hora e "hoje" valem no
 * fuso da clínica (`APP_TIMEZONE`), nunca no do aparelho: um paciente em
 * Manaus escolhe e vê o mesmo horário que a recepção em São Paulo.
 *
 * "Célula de calendário" é um `Date` à meia-noite do relógio do aparelho com
 * o ano/mês/dia do dia da clínica. Serve só para desenhar a grade (mês,
 * semana, rótulos); a conversão para/de instantes passa sempre por aqui.
 */

/** Célula de calendário do dia da clínica em que `instant` cai (padrão: agora). */
export function clinicDayCell(instant: Date = new Date()): Date {
  const { year, month, day } = zonedParts(instant);
  return new Date(year, month - 1, day);
}

/** Primeiro instante do dia que a célula representa, no fuso da clínica. */
export function cellStart(cell: Date): Date {
  return startOfZonedDay(
    cell.getFullYear(),
    cell.getMonth() + 1,
    cell.getDate(),
  );
}

/** Chave `AAAA-MM-DD` do dia da clínica de um instante ISO ou `Date`. */
export function instantDayKey(instant: string | Date): string {
  return zonedDateKey(new Date(instant));
}

/** Dia e hora preenchidos num formulário (`AAAA-MM-DD`, `HH:MM`) → instante no fuso da clínica. */
export function clinicInstant(date: string, time: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock) {
    return new Date(Number.NaN);
  }
  return zonedInstant(
    Number(day[1]),
    Number(day[2]),
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
  );
}

/** Minutos desde a meia-noite da clínica de um instante ISO. */
export function clinicMinutesOfDay(iso: string): number {
  const { hour, minute } = zonedParts(new Date(iso));
  return hour * 60 + minute;
}

/** Primeiro instante do dia `AAAA-MM-DD` escolhido num formulário, no fuso da clínica. */
export function clinicDayStart(date: string): Date {
  return clinicInstant(date, '00:00');
}

/** Último instante do dia `AAAA-MM-DD` (23:59:59 + `ms`), no fuso da clínica. */
export function clinicDayEnd(date: string, ms = 0): Date {
  return new Date(clinicInstant(date, '23:59').getTime() + 59_000 + ms);
}
