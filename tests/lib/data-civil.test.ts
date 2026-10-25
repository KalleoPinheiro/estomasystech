import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCivilDate } from '@/lib/format';

const ORIGINAL_TZ = process.env.TZ;

describe.each(['UTC', 'America/Sao_Paulo', 'America/Manaus'])(
  'Feature: data civil (nascimento) não passa por fuso, processo em %s (ADR-073)',
  (processTz) => {
    beforeEach(() => {
      process.env.TZ = processTz;
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.env.TZ = ORIGINAL_TZ;
    });

    it('Dado nascido em 01/01/2000 gravado à meia-noite UTC, Quando exibe, Então 01/01/2000', () => {
      expect(formatCivilDate('2000-01-01T00:00:00.000Z')).toBe('01/01/2000');
      expect(formatCivilDate('2000-01-01')).toBe('01/01/2000');
      expect(formatCivilDate('1990-05-10T00:00:00.000Z')).toBe('10/05/1990');
    });
  },
);
