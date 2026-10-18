import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { clinicScope } from '@/lib/auth/tenant-scope';
import type { ClinicInfoDto, ClinicRegistrationDto } from '@/lib/dto';
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
          cnpj: '12.345.678/0001-95',
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

    expect(body.data?.info.cnpj).toBe('12.345.678/0001-95');
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
        { name: 'Clínica EstomaSysTech Ltda' },
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

    expect(body.data?.info.name).toBe('Clínica EstomaSysTech Ltda');
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
        { cnpj: '11.111.111/0001-91' },
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

    expect(bodyB.data?.info.cnpj).not.toBe('11.111.111/0001-91');
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
        { name: 'Invadida pelo operador', cnpj: '99.999.999/0001-91' },
        cookieHeaderFor('super_admin', 'dono@estomasystech.app', null),
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

  it('Dado Admin de Empresa, Quando salvar o contato da clínica, Então o GET devolve telefone e e-mail; e-mail inválido responde 400', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');
    const put = (body: unknown) =>
      route.PUT(
        jsonRequest(
          '/api/settings/clinic-info',
          'PUT',
          body,
          adminCookieHeader(CLINIC_B_ID),
        ),
      );

    const saved = await put({
      contactPhone: ' 11 95555-6666 ',
      contactEmail: 'Recepcao@ClinicaB.com',
    });
    const invalid = await put({ contactEmail: 'sem-arroba' });
    const response = await route.GET(
      jsonRequest(
        '/api/settings/clinic-info',
        'GET',
        undefined,
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<{
      info: ClinicRegistrationDto;
    }>;

    expect(saved.status).toBe(200);
    expect(invalid.status).toBe(400);
    expect(body.data?.info.contactPhone).toBe('11 95555-6666');
    expect(body.data?.info.contactEmail).toBe('recepcao@clinicab.com');

    const cleared = await put({ contactEmail: null });
    const clearedBody = (await cleared.json()) as Envelope<{
      info: ClinicRegistrationDto;
    }>;
    expect(cleared.status).toBe(200);
    expect(clearedBody.data?.info.contactEmail).toBeNull();
    expect(clearedBody.data?.info.contactPhone).toBe('11 95555-6666');
  });

  it('Dado cadastro completo, Quando o Admin de Empresa limpar o e-mail de contato com texto vazio, Então o e-mail fica nulo e a plataforma vê o cadastro incompleto', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');
    const detail = await import('@/app/api/platform/clinics/[id]/route');
    const put = (body: unknown) =>
      route.PUT(
        jsonRequest(
          '/api/settings/clinic-info',
          'PUT',
          body,
          adminCookieHeader(CLINIC_B_ID),
        ),
      );
    const registrationComplete = async () => {
      const response = await detail.GET(
        jsonRequest(
          `/api/platform/clinics/${CLINIC_B_ID}`,
          'GET',
          undefined,
          cookieHeaderFor('super_admin', 'dono@estomasystech.app', null),
        ),
        { params: Promise.resolve({ id: CLINIC_B_ID }) },
      );
      const body = (await response.json()) as Envelope<{
        registrationComplete: boolean;
      }>;
      expect(response.status).toBe(200);
      return body.data?.registrationComplete;
    };

    const filled = await put({
      cnpj: '33.444.555/0001-81',
      contactPhone: '11 94444-5555',
      contactEmail: 'contato@clinicab.com',
    });
    expect(filled.status).toBe(200);
    expect(await registrationComplete()).toBe(true);

    const cleared = await put({ contactEmail: '' });
    const clearedBody = (await cleared.json()) as Envelope<{
      info: ClinicRegistrationDto;
    }>;

    expect(cleared.status).toBe(200);
    expect(clearedBody.data?.info.contactEmail).toBeNull();
    expect(clearedBody.data?.info.contactPhone).toBe('11 94444-5555');
    expect(await registrationComplete()).toBe(false);
  });

  it('Dado CNPJ de outra clínica, Quando o Admin de Empresa salvar, Então 400 e o CNPJ não muda', async () => {
    await ensureTestClinics();
    const route = await import('@/app/api/settings/clinic-info/route');
    await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { cnpj: '55.666.777/0001-81' },
        adminCookieHeader(CLINIC_A_ID),
      ),
    );

    const response = await route.PUT(
      jsonRequest(
        '/api/settings/clinic-info',
        'PUT',
        { cnpj: '55666777000181' },
        adminCookieHeader(CLINIC_B_ID),
      ),
    );
    const body = (await response.json()) as Envelope<never>;

    expect(response.status).toBe(400);
    expect(body.error).toBe('Já existe clínica com este CNPJ');
    const { getRepositories } = await import('@/infrastructure/container');
    const { clinics } = await getRepositories(clinicScope(CLINIC_B_ID));
    expect((await clinics.findById(CLINIC_B_ID))?.cnpj).not.toBe(
      '55.666.777/0001-81',
    );
  });
});
