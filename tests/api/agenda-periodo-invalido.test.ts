import { beforeAll, describe, expect, it } from 'vitest';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const VALID = '2027-09-30T00:00:00.000Z';

/** Link editado à mão com período inválido é erro do cliente (400), não alarme de servidor (500). */
describe('Feature: Período inválido na agenda responde 400 (#538)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  const call = async (path: string, query: string) => {
    const route = path.endsWith('status-counts')
      ? await import('@/app/api/appointments/status-counts/route')
      : await import('@/app/api/appointments/route');
    return route.GET(
      jsonRequest(
        `${path}?${query}`,
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
  };

  for (const path of ['/api/appointments', '/api/appointments/status-counts']) {
    it(`Dado from inválido, Quando GET ${path}, Então 400`, async () => {
      expect((await call(path, `from=abc&to=${VALID}`)).status).toBe(400);
    });

    it(`Dado to inválido, Quando GET ${path}, Então 400`, async () => {
      expect((await call(path, `from=${VALID}&to=2027-13-45`)).status).toBe(
        400,
      );
    });

    it(`Dado período válido, Quando GET ${path}, Então 200`, async () => {
      expect(
        (await call(path, `from=2027-09-01T00:00:00.000Z&to=${VALID}`)).status,
      ).toBe(200);
    });
  }
});
