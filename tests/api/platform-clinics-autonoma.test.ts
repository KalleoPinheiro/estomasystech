import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.estomasystech.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const SUPER_ADMIN = cookieHeaderFor(
  'super_admin',
  'dono@estomasystech.app',
  null,
);

const individualBody = (overrides: Record<string, unknown> = {}) => ({
  kind: 'individual',
  name: 'Jeiciele Silva',
  cnpj: null,
  cpf: '529.982.247-25',
  contactPhone: '11 98888-7777',
  contactEmail: 'contato@jeiciele.test',
  adminEmail: 'jeiciele@exemplo.test',
  professionalName: '',
  professionalRegistry: 'COREN-SP 123456',
  ...overrides,
});

const create = async (body: unknown) => {
  const route = await import('@/app/api/platform/clinics/route');
  const response = await route.POST(
    jsonRequest('/api/platform/clinics', 'POST', body, SUPER_ADMIN),
  );
  return {
    response,
    json: (await response.json()) as Envelope<{
      clinic: Record<string, unknown> & { id: string };
    }>,
  };
};

const list = async () => {
  const route = await import('@/app/api/platform/clinics/route');
  const response = await route.GET(
    jsonRequest('/api/platform/clinics', 'GET', undefined, SUPER_ADMIN),
  );
  return (await response.json()) as Envelope<Record<string, unknown>[]>;
};

describe('Feature: Cadastro da profissional autônoma pela plataforma (#977)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado o cadastro da autônoma com CPF, Quando o super_admin criar, Então cria com o tipo, o CPF e ela como responsável técnica', async () => {
    const { response, json } = await create(individualBody());

    expect(response.status).toBe(200);
    expect(json.data.clinic).toMatchObject({
      kind: 'individual',
      cpf: '52998224725',
      cnpj: null,
      professionalName: 'Jeiciele Silva',
      professionalRegistry: 'COREN-SP 123456',
      registrationComplete: true,
    });
  });

  it('Dada a autônoma criada, Quando listar, Então a lista mostra o CPF só mascarado', async () => {
    const { json } = await create(
      individualBody({ cpf: '98765432100', adminEmail: 'b@exemplo.test' }),
    );

    const row = (await list()).data.find((c) => c.id === json.data.clinic.id);
    expect(row).toMatchObject({
      kind: 'individual',
      cpfMasked: '***.***.321-**',
      cnpj: null,
    });
    expect(JSON.stringify(row)).not.toContain('98765432100');
  });

  it('Dado CPF já usado por outra autônoma, Quando criar, Então 400 com a mensagem do CPF repetido', async () => {
    await create(
      individualBody({ cpf: '39053344705', adminEmail: 'c@exemplo.test' }),
    );

    const { response, json } = await create(
      individualBody({ cpf: '390.533.447-05', adminEmail: 'd@exemplo.test' }),
    );

    expect(response.status).toBe(400);
    expect(json.error).toBe('Já existe profissional autônoma com este CPF');
  });

  it('Dada autônoma com CNPJ ou sem CPF, Quando criar, Então 400 e nada é criado', async () => {
    const withCnpj = await create(
      individualBody({
        cpf: '71428793860',
        cnpj: '12.345.678/0001-95',
        adminEmail: 'e@exemplo.test',
      }),
    );
    const withoutCpf = await create(
      individualBody({ cpf: null, adminEmail: 'f@exemplo.test' }),
    );

    expect(withCnpj.response.status).toBe(400);
    expect(withCnpj.json.error).toBe(
      'Profissional autônoma não tem CNPJ: informe só o CPF',
    );
    expect(withoutCpf.response.status).toBe(400);
    expect(withoutCpf.json.error).toBe(
      'CPF é obrigatório para a profissional autônoma',
    );
  });
});
