import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clinicDayEnd, clinicDayStart } from '@/lib/clinic-calendar';

const ORIGINAL_TZ = process.env.TZ;

describe.each(['UTC', 'America/Manaus', 'Asia/Tokyo'])(
  'Feature: datas digitadas (validade, auditoria) no fuso da clínica, aparelho em %s',
  (deviceTz) => {
    beforeEach(() => {
      process.env.TZ = deviceTz;
      vi.stubEnv('APP_TIMEZONE', 'America/Sao_Paulo');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.env.TZ = ORIGINAL_TZ;
    });

    it('Dado validade 30/11, Quando converte, Então termina às 23:59:59 de São Paulo', () => {
      expect(clinicDayEnd('2026-11-30').toISOString()).toBe(
        '2026-12-01T02:59:59.000Z',
      );
      expect(clinicDayEnd('2026-11-30', 999).toISOString()).toBe(
        '2026-12-01T02:59:59.999Z',
      );
      expect(clinicDayStart('2026-11-30').toISOString()).toBe(
        '2026-11-30T03:00:00.000Z',
      );
    });
  },
);
