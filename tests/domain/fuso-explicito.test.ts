import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPeriodEnded,
  periodBounds,
} from '@/domain/billing/commission-payout';
import {
  assertWithinProfessionalHours,
  localDateKey,
} from '@/domain/scheduling/schedule-availability';
import { ValidationError } from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import {
  isValidTimeZone,
  shiftZonedMonths,
  startOfZonedDay,
  startOfZonedDayAfter,
  startOfZonedMonth,
  startOfZonedMonthOf,
  zonedInstant,
  zonedMonthKey,
} from '@/domain/shared/time-zone';
import { previousPeriod } from '@/lib/dto/payout';
import { formatDate, formatTime } from '@/lib/format';

const ORIGINAL_TZ = process.env.TZ;
const slot = (start: string, end: string) =>
  TimeSlot.create(new Date(start), new Date(end));
// Quarta 08:00–18:00.
const WEDNESDAY = [{ weekday: 3, startMinute: 8 * 60, endMinute: 18 * 60 }];

/** Roda o mesmo cenário com o processo em UTC, em São Paulo e em Tóquio. */
describe.each(['UTC', 'America/Sao_Paulo', 'Asia/Tokyo'])(
  'Feature: regras de data no fuso da clínica, processo em %s (#563)',
  (processTz) => {
    beforeEach(() => {
      process.env.TZ = processTz;
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.env.TZ = ORIGINAL_TZ;
    });

    it.each([
      [
        '09:00–09:30 aceita',
        '2026-10-28T12:00:00Z',
        '2026-10-28T12:30:00Z',
        true,
      ],
      [
        '07:30–08:00 de SP rejeita',
        '2026-10-28T10:30:00Z',
        '2026-10-28T11:00:00Z',
        false,
      ],
      [
        '05:30–06:00 de SP rejeita',
        '2026-10-28T08:30:00Z',
        '2026-10-28T09:00:00Z',
        false,
      ],
      [
        '17:30–18:00 de SP aceita',
        '2026-10-28T20:30:00Z',
        '2026-10-28T21:00:00Z',
        true,
      ],
      [
        '18:00–18:30 de SP rejeita',
        '2026-10-28T21:00:00Z',
        '2026-10-28T21:30:00Z',
        false,
      ],
      [
        'quarta 21:00 de SP rejeita (quinta em UTC)',
        '2026-10-29T00:00:00Z',
        '2026-10-29T00:30:00Z',
        false,
      ],
    ])('janela do profissional: %s', (_label, start, end, accepted) => {
      const act = () =>
        assertWithinProfessionalHours(slot(start, end), WEDNESDAY);
      if (accepted) {
        expect(act).not.toThrow();
      } else {
        expect(act).toThrow(ValidationError);
      }
    });

    it('dia do bloqueio vira na meia-noite de SP, não na do processo', () => {
      expect(localDateKey(new Date('2026-10-29T00:00:00Z'))).toBe('2026-10-28');
      expect(localDateKey(new Date('2026-10-29T02:59:00Z'))).toBe('2026-10-28');
      expect(localDateKey(new Date('2026-10-29T03:00:00Z'))).toBe('2026-10-29');
    });

    it('limites de dia e mês da clínica', () => {
      const lateNight = new Date('2026-10-29T01:30:00Z'); // 22:30 de 28/10 em SP
      expect(startOfZonedDayAfter(lateNight, 0).toISOString()).toBe(
        '2026-10-28T03:00:00.000Z',
      );
      expect(startOfZonedDayAfter(lateNight).toISOString()).toBe(
        '2026-10-29T03:00:00.000Z',
      );
      const monthEnd = new Date('2026-11-01T01:00:00Z'); // 31/10 22:00 em SP
      expect(startOfZonedMonthOf(monthEnd).toISOString()).toBe(
        '2026-10-01T03:00:00.000Z',
      );
      expect(zonedMonthKey(monthEnd)).toBe('2026-10');
      expect(previousPeriod(monthEnd)).toBe('2026-09');
      expect(periodBounds('2026-10').end.toISOString()).toBe(
        '2026-11-01T03:00:00.000Z',
      );
      // 31/10 22:00 em SP: outubro ainda não encerrou.
      expect(isPeriodEnded('2026-10', monthEnd)).toBe(false);
      expect(isPeriodEnded('2026-10', new Date('2026-11-01T03:00:00Z'))).toBe(
        true,
      );
      expect(startOfZonedMonth(2026, 13).toISOString()).toBe(
        '2027-01-01T03:00:00.000Z',
      );
    });

    it('formatadores mostram o horário da clínica', () => {
      expect(formatTime('2026-10-28T12:00:00Z')).toBe('09:00');
      expect(formatDate('2026-10-29T01:30:00Z')).toBe('28/10/2026');
      expect(formatDate('1990-05-17')).toBe('17/05/1990');
    });
  },
);

describe('Feature: fuso com horário de verão', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('meia-noite local e hora de parede acompanham a mudança de offset', () => {
    vi.stubEnv('APP_TIMEZONE', 'America/New_York');
    expect(startOfZonedDay(2026, 3, 8).toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(startOfZonedDay(2026, 3, 9).toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
    expect(zonedInstant(2026, 3, 9, 8, 30).toISOString()).toBe(
      '2026-03-09T12:30:00.000Z',
    );
    expect(
      shiftZonedMonths(new Date('2026-04-15T16:00:00Z'), -2).toISOString(),
    ).toBe('2026-02-15T17:00:00.000Z');
  });

  it('valida identificador IANA', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Fuso/Inexistente')).toBe(false);
  });
});
