import { describe, expect, it } from 'vitest';
import type { CalendarIntegrationStatusDto } from '@/lib/dto';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';

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
      connected: false,
      email: null,
      connectedAt: null,
    });
  });

  it('Dada clínica com conta conectada, Quando GET, Então connected é true com e-mail e data', async () => {
    await ensureTestClinics();
    const { getRepositories } = await import('@/infrastructure/container');
    const { googleAccounts } = await getRepositories({ clinicId: CLINIC_A_ID });
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
    const { googleAccounts } = await getRepositories({ clinicId: CLINIC_A_ID });
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

  it('Dado super_admin (clinicId null), Quando GET, Então resolve a conexão de escopo de sistema salva sob clinicId null (AD-017: papel de sistema não filtra por clínica)', async () => {
    await ensureTestClinics();
    // `findMostRecent()` com clinicId null não filtra por clínica (AD-017) —
    // zera a tabela pra garantir que só a conta de sistema salva abaixo
    // possa vencer o `ORDER BY connectedAt DESC`, independente de outros
    // testes já terem salvo contas com `connectedAt = new Date()` (agora).
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const schema = await import('@/infrastructure/persistence/drizzle/schema');
    await (await getDb()).delete(schema.googleAccounts);
    const { getRepositories } = await import('@/infrastructure/container');
    const { googleAccounts: systemAccounts } = await getRepositories({
      clinicId: null,
    });
    const connectedAt = new Date('2026-08-05T09:00:00.000Z');
    await systemAccounts.save({
      email: 'root@vitta.com',
      encryptedRefreshToken: 'cipher-text-sistema',
      connectedAt,
    });
    const route = await import('@/app/api/settings/calendar-integration/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/calendar-integration',
        'GET',
        undefined,
        cookieHeaderFor('super_admin', 'root@vitta.com', null),
      ),
    );
    const body =
      (await response.json()) as Envelope<CalendarIntegrationStatusDto>;

    expect(response.status).toBe(200);
    expect(body.data?.connected).toBe(true);
    expect(body.data?.email).toBe('root@vitta.com');
    expect(body.data?.connectedAt).toBe(connectedAt.toISOString());
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
});
