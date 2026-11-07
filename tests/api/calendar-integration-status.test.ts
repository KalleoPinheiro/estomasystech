import { describe, expect, it, vi } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { CalendarIntegrationStatusDto } from '@/lib/dto';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

describe('Feature: Status da conexão do Google Agenda (issue #124)', () => {
  it('Dada clínica sem conta conectada, Quando GET, Então connected é false e email/connectedAt são null', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body =
      (await response.json()) as Envelope<CalendarIntegrationStatusDto>;

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      configured: false,
      connected: false,
      email: null,
      connectedAt: null,
    });
  });

  it('Dada clínica com conta conectada, Quando GET, Então connected é true com e-mail e data', async () => {
    await ensureTestClinics();
    const { getRepositories } = await import('@/infrastructure/container');
    const { googleAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const connectedAt = new Date('2026-08-01T12:00:00.000Z');
    await googleAccounts.save({
      email: 'agenda@clinica.com',
      encryptedRefreshToken: 'cipher-text',
      connectedAt,
    });
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body =
      (await response.json()) as Envelope<CalendarIntegrationStatusDto>;

    expect(response.status).toBe(200);
    expect(body.data?.connected).toBe(true);
    expect(body.data?.email).toBe('agenda@clinica.com');
    expect(body.data?.connectedAt).toBe(connectedAt.toISOString());
  });

  it('Dados de uma clínica conectados, Quando outra clínica busca o status, Então não vaza entre empresas (MT-06)', async () => {
    await ensureTestClinics();
    const { getRepositories } = await import('@/infrastructure/container');
    const { googleAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    await googleAccounts.save({
      email: 'so-clinica-a@clinica.com',
      encryptedRefreshToken: 'cipher-text',
      connectedAt: new Date(),
    });
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body =
      (await response.json()) as Envelope<CalendarIntegrationStatusDto>;

    expect(body.data?.connected).toBe(false);
  });

  it('Papel atendente também consegue ver o status (rota não é exclusiva de admin)', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        cookieHeaderFor('atendente', undefined, CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(200);
  });

  it('Dado super_admin (clinicId null), Quando GET, Então 403: a agenda da clínica não é da plataforma (ADR-007)', async () => {
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        cookieHeaderFor('super_admin', 'root@estomasystech.com', null),
      ),
    );

    expect(response.status).toBe(403);
  });

  it('Dado sem sessão, Quando GET, Então retorna 401', async () => {
    const route = await import('@/app/api/settings/calendar-integration/route');
    const { NextRequest } = await import('next/server');

    const response = await route.GET(
      new NextRequest('http://localhost/api/settings/calendar-integration', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('Dado Google configurado (client id, secret e APP_URL), Quando GET, Então configured é true (#658)', async () => {
    await ensureTestClinics();
    vi.stubEnv('GOOGLE_CLIENT_ID', 'id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'segredo');
    vi.stubEnv('APP_URL', 'https://app.example.com');
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body =
      (await response.json()) as Envelope<CalendarIntegrationStatusDto>;
    vi.unstubAllEnvs();

    expect(body.data?.configured).toBe(true);
  });

  it('Dado Google sem credenciais, Quando GET, Então configured é false mesmo com conta conectada (#658)', async () => {
    await ensureTestClinics();
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const { getRepositories } = await import('@/infrastructure/container');
    const { googleAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    await googleAccounts.save({
      email: 'conectada@clinica.com',
      encryptedRefreshToken: 'cipher-text',
      connectedAt: new Date(),
    });
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body =
      (await response.json()) as Envelope<CalendarIntegrationStatusDto>;
    vi.unstubAllEnvs();

    expect(body.data?.connected).toBe(true);
    expect(body.data?.configured).toBe(false);
  });
});
