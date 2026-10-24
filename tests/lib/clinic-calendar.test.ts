import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cellStart,
  clinicDayCell,
  clinicInstant,
  clinicMinutesOfDay,
  instantDayKey,
} from '@/lib/clinic-calendar';

const ORIGINAL_TZ = process.env.TZ;

describe.each(['UTC', 'Asia/Tokyo', 'America/Manaus'])(
  'Feature: calendário da clínica com o aparelho em %s (#543)',
  (deviceTz) => {
    beforeEach(() => {
      process.env.TZ = deviceTz;
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.env.TZ = ORIGINAL_TZ;
    });

    it('Dado 22:30 de SP, Quando pede o dia da clínica, Então ainda é o dia 28', () => {
      const cell = clinicDayCell(new Date('2026-10-29T01:30:00Z'));
      expect([cell.getFullYear(), cell.getMonth(), cell.getDate()]).toEqual([
        2026, 9, 28,
      ]);
      expect(instantDayKey('2026-10-29T01:30:00Z')).toBe('2026-10-28');
      expect(cellStart(cell).toISOString()).toBe('2026-10-28T03:00:00.000Z');
    });

    it('Dado data e hora digitadas, Quando converte, Então grava o instante de SP', () => {
      expect(clinicInstant('2026-10-28', '09:00').toISOString()).toBe(
        '2026-10-28T12:00:00.000Z',
      );
      expect(Number.isNaN(clinicInstant('', '09:00').getTime())).toBe(true);
      expect(clinicMinutesOfDay('2026-10-28T12:30:00Z')).toBe(9 * 60 + 30);
    });
  },
);
