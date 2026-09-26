import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertWithinBusinessHours } from '@/domain/scheduling/business-hours';
import { ValidationError } from '@/domain/shared/errors';
import { TimeSlot } from '@/domain/shared/time-slot';
import {
  startOfZonedDay,
  zonedDateKey,
  zonedParts,
} from '@/domain/shared/time-zone';

const slot = (start: string, end: string) =>
  TimeSlot.create(new Date(start), new Date(end));

/**
 * Issue #205: a suíte roda com TZ=UTC no processo (vitest.config.mts). Com
 * APP_TIMEZONE=America/Sao_Paulo a grade 08–18 tem de valer em Brasília —
 * antes ela valia no fuso do processo (05–15h de Brasília num deploy em UTC).
 */
describe('Feature: grade no fuso da aplicação (#205)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('C28 grade avaliada no fuso da aplicação, não do processo', () => {
    vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');

    // Terça 2027-06-08: 12:00Z = 09:00 BRT → dentro da grade.
    expect(() =>
      assertWithinBusinessHours(
        slot('2027-06-08T12:00:00Z', '2027-06-08T13:00:00Z'),
      ),
    ).not.toThrow();
    // 21:30Z–22:30Z = 18:30–19:30 BRT → fora (18:30 BRT seria 21:30 "local" em UTC).
    expect(() =>
      assertWithinBusinessHours(
        slot('2027-06-08T21:30:00Z', '2027-06-08T22:30:00Z'),
      ),
    ).toThrow(ValidationError);
    // 08:30Z–09:30Z = 05:30 BRT → fora (no fuso do processo estaria dentro).
    expect(() =>
      assertWithinBusinessHours(
        slot('2027-06-08T08:30:00Z', '2027-06-08T09:30:00Z'),
      ),
    ).toThrow(ValidationError);
  });

  it('mesmo instante com APP_TIMEZONE=UTC segue o comportamento histórico', () => {
    vi.stubEnv('APP_TIMEZONE', 'UTC');

    expect(() =>
      assertWithinBusinessHours(
        slot('2027-06-08T08:30:00Z', '2027-06-08T09:30:00Z'),
      ),
    ).not.toThrow();
  });

  it('dia da semana vem do fuso: sábado 01:00Z ainda é sexta em Brasília', () => {
    expect(
      zonedParts(new Date('2027-06-12T01:00:00Z'), 'America/Sao_Paulo'),
    ).toMatchObject({ weekday: 5, day: 11, hour: 22 });
  });

  it('meia-noite local e chave de dia no fuso', () => {
    expect(startOfZonedDay(2027, 6, 9, 'America/Sao_Paulo').toISOString()).toBe(
      '2027-06-09T03:00:00.000Z',
    );
    // Mês estourado normaliza como Date.UTC (31/12 + 1).
    expect(startOfZonedDay(2027, 12, 32, 'UTC').toISOString()).toBe(
      '2028-01-01T00:00:00.000Z',
    );
    expect(
      zonedDateKey(new Date('2027-06-09T02:59:00Z'), 'America/Sao_Paulo'),
    ).toBe('2027-06-08');
  });

  it('meia-noite local em fuso com horário de verão', () => {
    // Nova York: 2027-03-14 muda de EST (-5) para EDT (-4) às 02:00.
    expect(startOfZonedDay(2027, 3, 14, 'America/New_York').toISOString()).toBe(
      '2027-03-14T05:00:00.000Z',
    );
    expect(startOfZonedDay(2027, 3, 15, 'America/New_York').toISOString()).toBe(
      '2027-03-15T04:00:00.000Z',
    );
  });
});
