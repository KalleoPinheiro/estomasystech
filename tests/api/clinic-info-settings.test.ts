import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { ClinicInfoDto } from '@/lib/dto';
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

describe('Feature: Dados cadastrais da clínica (issue #61)', () => {
  it('Dada clínica sem dados salvos, Quando buscar, Então retorna campos nulos (não erro)', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');

    const response = await route.GET(
      jsonRequest(
        '/api/settings/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ info: ClinicInfoDto }>;

    expect(response.status).toBe(200);
    expect(body.data?.info.cnpj).toBeNull();
    expect(body.data?.info.professionalName).toBeNull();
  });

  it('Dado Admin de Empresa, Quando salvar dados cadastrais, Então GET subsequente reflete os valores', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');

    await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        {
          cnpj: '12.345.678/0001-90',
          address: 'Rua das Flores, 100',
          city: 'São Paulo',
          professionalName: 'Enf. Ana',
          professionalRegistry: 'COREN-SP 123456',
        },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const response = await route.GET(
      jsonRequest(
        '/api/settings/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ info: ClinicInfoDto }>;

    expect(body.data?.info.cnpj).toBe('12.345.678/0001-90');
    expect(body.data?.info.professionalName).toBe('Enf. Ana');
    expect(body.data?.info.professionalRegistry).toBe('COREN-SP 123456');
  });

  it('Dado Admin de Empresa, Quando salvar a razão social, Então GET subsequente reflete o novo nome', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');

    await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { name: 'Clínica VittaFlow Ltda' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const response = await route.GET(
      jsonRequest(
        '/api/settings/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{ info: ClinicInfoDto }>;

    expect(body.data?.info.name).toBe('Clínica VittaFlow Ltda');
  });

  it('Dado Admin de Empresa, Quando salvar dados cadastrais, Então registra evento de auditoria (#71)', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');
    const { getRepositories } = await import('@/infrastructure/container');
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));

    await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { name: 'Clínica Auditada Ltda' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    const events = await auditEvents.findAll();
    const event = events.find(
      (e) => e.resourceType === 'clinic-info' && e.resourceId === CLINIC_A_ID,
    );
    expect(event).toBeDefined();
    expect(event?.action).toBe('update');
  });

  it('Dado Admin de Empresa, Quando enviar nome vazio, Então retorna 400', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');

    const response = await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { name: '' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(400);
  });

  it('Dados salvos em uma clínica, Quando outra clínica busca, Então não vaza entre empresas (MT-06)', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');

    await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { cnpj: '11.111.111/0001-11' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );
    const responseB = await route.GET(
      jsonRequest(
        '/api/settings/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const bodyB = (await responseB.json()) as Envelope<{ info: ClinicInfoDto }>;

    expect(bodyB.data?.info.cnpj).not.toBe('11.111.111/0001-11');
  });

  it('Dado papel atendente, Quando tentar salvar, Então retorna 403', async () => {
    const response = await (
      await import('@/app/api/settings/clinic-info/route')
    ).PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { cnpj: '00.000.000/0001-00' },
        cookieHeaderFor('atendente', undefined, CLINIC_A_ID),
      ),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('Dado papel profissional, Quando tentar salvar, Então retorna 403', async () => {
    const response = await (
      await import('@/app/api/settings/clinic-info/route')
    ).PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { cnpj: '00.000.000/0001-00' },
        cookieHeaderFor('profissional', undefined, CLINIC_A_ID),
      ),
    );

    expect(response.status).toBe(403);
  });

  it('Dado super_admin sem o proxy, Quando tentar salvar, Então super_admin recebe 403 e a clínica não muda', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');
    const { getRepositories } = await import('@/infrastructure/container');
    const { clinics } = await getRepositories(clinicScope(CLINIC_A_ID));
    const before = await clinics.findById(CLINIC_A_ID);

    const response = await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { name: 'Invadida pelo operador', cnpj: '99.999.999/0001-99' },
        cookieHeaderFor('super_admin', 'dono@vitta.app', null),
      ),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(403);
    expect(body.error).toBe('Seu papel não tem acesso a este recurso');
    expect(await clinics.findById(CLINIC_A_ID)).toEqual(before);
  });

  it('Dado sem sessão, Quando buscar, Então retorna 401', async () => {
    const response = await (
      await import('@/app/api/settings/clinic-info/route')
    ).GET(
      new NextRequest('http://localhost/api/settings/clinic-info', {
        method: 'GET',
      }),
    );

    expect(response.status).toBe(401);
  });
});
