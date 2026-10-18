import { describe, expect, it } from 'vitest';
import type { ClinicInfoDto } from '@/lib/dto';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

describe('Feature: /api/clinic-info lê dados cadastrais do banco (issue #61)', () => {
  it('Dada clínica sem dados cadastrados, Quando buscar, Então retorna nome default e demais campos nulos', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/clinic-info/route');

    const response = await route.GET(
      jsonRequest(
        '/api/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<ClinicInfoDto>;

    expect(response.status).toBe(200);
    expect(body.data?.cnpj).toBeNull();
    expect(body.data?.professionalName).toBeNull();
  });

  it('Dados salvos via /api/settings/clinic-info, Quando buscar em /api/clinic-info, Então reflete os mesmos valores', async () => {
    await ensureTestClinics();
    const settingsRoute = await import('@/app/api/settings/clinic-info/route');
    const infoRoute = await import('@/app/api/clinic-info/route');

    await settingsRoute.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        {
          cnpj: '22.222.222/0001-91',
          professionalName: 'Enf. Bia',
          professionalRegistry: 'COREN-SP 654321',
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const response = await infoRoute.GET(
      jsonRequest(
        '/api/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<ClinicInfoDto>;

    expect(body.data?.cnpj).toBe('22.222.222/0001-91');
    expect(body.data?.professionalName).toBe('Enf. Bia');
    expect(body.data?.professionalRegistry).toBe('COREN-SP 654321');
  });
});
