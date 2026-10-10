import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashAuthTokenSecret, INVITE_TTL_MS } from '@/domain/auth/auth-token';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { spyOnSentEmails } from '../support/email';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface ClinicDto {
  id: string;
  name: string;
  cnpj: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  city: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
  registrationComplete: boolean;
  createdAt: string;
}

interface CreatedDto {
  clinic: ClinicDto;
  admin: {
    id: string;
    email: string;
    role: string;
    clinicId: string;
    active: boolean;
    passwordSet: boolean;
    professionalId: string | null;
    delivered: boolean;
    inviteUrl: string | null;
  };
}

interface SummaryDto {
  id: string;
  name: string;
  cnpj: string | null;
  registrationComplete: boolean;
  adminStatus: 'none' | 'pending' | 'active';
  createdAt: string;
}

const SUPER_ADMIN = cookieHeaderFor('super_admin', 'dono@vitta.app', null);

let cnpjSeq = 10;
/** CNPJ novo por teste — `uq_clinics_cnpj` recusa repetido. */
const nextCnpj = () => `90.${String(cnpjSeq++).padStart(3, '0')}.000/0001-00`;

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Clínica Nova',
  cnpj: nextCnpj(),
  contactPhone: '11 3333-4444',
  contactEmail: 'contato@nova.com',
  adminEmail: 'admin@nova.com',
  professionalName: 'Enf. Ana',
  professionalRegistry: 'COREN-SP 123456',
  ...overrides,
});

const create = async (body: unknown) => {
  const route = await import('@/app/api/platform/clinics/route');
  const response = await route.POST(
    jsonRequest('/api/platform/clinics', 'POST', body, SUPER_ADMIN),
  );
  const json = (await response.json()) as Envelope<CreatedDto>;
  return { response, json };
};

const list = async () => {
  const route = await import('@/app/api/platform/clinics/route');
  const response = await route.GET(
    jsonRequest('/api/platform/clinics', 'GET', undefined, SUPER_ADMIN),
  );
  const json = (await response.json()) as Envelope<SummaryDto[]>;
  return { response, json };
};

const repositories = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

/** Contas com o e-mail em qualquer clínica — a clínica recusada nem tem id. */
const accountsAnywhere = async (email: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  const { systemScope } = await import('@/lib/auth/tenant-scope');
  const { userAccounts } = await getRepositories(systemScope());
  return userAccounts.findAllByEmail(email);
};

const clinicCount = async () => {
  const { clinics } = await repositories('legacy-clinic');
  return (await clinics.findAll()).length;
};

describe('Feature: Cadastro de clínica pela plataforma (B4, #214)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado o cadastro completo, Quando o super_admin criar, Então cria a clínica e convida o primeiro admin', async () => {
    const emails = spyOnSentEmails();
    const body = validBody({ cnpj: '12345678000195' });

    const { response, json } = await create(body);

    expect(response.status).toBe(200);
    expect(json.data.clinic).toEqual({
      id: expect.any(String),
      name: 'Clínica Nova',
      cnpj: '12.345.678/0001-95',
      contactPhone: '11 3333-4444',
      contactEmail: 'contato@nova.com',
      address: null,
      city: null,
      professionalName: 'Enf. Ana',
      professionalRegistry: 'COREN-SP 123456',
      registrationComplete: true,
      status: 'active',
      statusChangedAt: null,
      statusChangedBy: null,
      createdAt: expect.any(String),
    });
    const clinicId = json.data.clinic.id;
    expect(json.data.admin).toEqual({
      id: expect.any(String),
      email: 'admin@nova.com',
      role: 'company_admin',
      clinicId,
      active: true,
      passwordSet: false,
      professionalId: null,
      // A clínica nova não tem canal: o convite nunca sai por e-mail (C2, #265).
      delivered: false,
      inviteUrl: expect.stringMatching(
        /^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/,
      ),
    });
    const { clinics, userAccounts } = await repositories(clinicId);
    expect((await clinics.findById(clinicId))?.cnpj).toBe('12.345.678/0001-95');
    const [admin] = await userAccounts.findAllByEmail('admin@nova.com');
    expect(admin?.clinicId).toBe(clinicId);
    expect(admin?.role).toBe('company_admin');
    expect(admin?.passwordHash).toBe(UNSET_PASSWORD_HASH);
    expect(emails.bodies).toHaveLength(0);
  });

  it('C2/#265 link manual: nenhum envio, e o link devolvido é um convite de 24 h', async () => {
    const emails = spyOnSentEmails();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const before = Date.now();

    const { response, json } = await create(
      validBody({ adminEmail: 'link-manual@nova.com' }),
    );

    vi.unstubAllGlobals();
    expect(response.status).toBe(200);
    expect(emails.bodies).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.data.admin.delivered).toBe(false);
    expect(json.data.admin.inviteUrl).toMatch(
      /^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/,
    );
    const secret = new URL(json.data.admin.inviteUrl ?? '').searchParams.get(
      'token',
    );
    const { getRepositories } = await import('@/infrastructure/container');
    const { authTokens } = await getRepositories(systemScope());
    const hash = hashAuthTokenSecret(secret ?? '');
    // Depois de 24 h já não vale; um minuto antes, ainda é um convite válido.
    expect(
      await authTokens.claimBySecretHash(hash, Date.now() + INVITE_TTL_MS + 1),
    ).toBeNull();
    const token = await authTokens.claimBySecretHash(
      hash,
      before + INVITE_TTL_MS - 60_000,
    );
    expect(token?.purpose).toBe('invite');
    expect(token?.accountId).toBe(json.data.admin.id);
  });

  it.each([
    ['name ausente', { name: undefined }],
    ['name vazio', { name: '  ' }],
    ['cnpj ausente', { cnpj: undefined }],
    ['cnpj malformado', { cnpj: '123' }],
    ['contactPhone ausente', { contactPhone: undefined }],
    ['contactPhone vazio', { contactPhone: '' }],
    ['contactEmail ausente', { contactEmail: undefined }],
    ['contactEmail inválido', { contactEmail: 'sem-arroba' }],
    ['adminEmail ausente', { adminEmail: undefined }],
    ['adminEmail inválido', { adminEmail: 'a@b' }],
  ])(
    'Dado %s, Quando criar, Então valida os campos obrigatórios (400, nada criado)',
    async (_label, overrides) => {
      spyOnSentEmails();
      const before = await clinicCount();
      const adminEmail = `invalido-${cnpjSeq}@x.com`;

      const { response, json } = await create(
        validBody({ adminEmail, ...overrides }),
      );

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(await clinicCount()).toBe(before);
      expect(await accountsAnywhere(adminEmail)).toEqual([]);
    },
  );

  it('Dado CNPJ já usado por outra clínica, Quando criar, Então CNPJ repetido responde 400 e nada é criado', async () => {
    spyOnSentEmails();
    const cnpj = nextCnpj();
    await create(validBody({ cnpj, adminEmail: 'primeira@x.com' }));
    const before = await clinicCount();

    const { response, json } = await create(
      validBody({ cnpj: cnpj.replace(/\D/g, ''), adminEmail: 'segunda@x.com' }),
    );

    expect(response.status).toBe(400);
    expect(json.error).toBe('Já existe clínica com este CNPJ');
    expect(await clinicCount()).toBe(before);
    expect(await accountsAnywhere('segunda@x.com')).toEqual([]);
  });

  it('Dadas criações concorrentes com o mesmo CNPJ, Quando criar, Então uma 200, outra 400 e uma clínica só', async () => {
    spyOnSentEmails();
    const cnpj = nextCnpj();
    const before = await clinicCount();

    const results = await Promise.all([
      create(validBody({ cnpj, adminEmail: 'corrida-1@x.com' })),
      create(validBody({ cnpj, adminEmail: 'corrida-2@x.com' })),
    ]);

    expect(results.map((r) => r.response.status).sort()).toEqual([200, 400]);
    const loser = results.find((r) => r.response.status === 400);
    expect(loser?.json.error).toBe('Já existe clínica com este CNPJ');
    expect(await clinicCount()).toBe(before + 1);
  });

  it('Dada a checagem prévia vencida pela corrida, Quando o índice recusa, Então a violação de uq_clinics_cnpj vira 400', async () => {
    spyOnSentEmails();
    const cnpj = nextCnpj();
    await create(validBody({ cnpj, adminEmail: 'indice-1@x.com' }));
    const { DrizzleClinicRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-clinic-repository'
    );
    vi.spyOn(DrizzleClinicRepository.prototype, 'findByCnpj').mockResolvedValue(
      null,
    );
    const before = await clinicCount();

    const { response, json } = await create(
      validBody({ cnpj, adminEmail: 'indice-2@x.com' }),
    );

    expect(response.status).toBe(400);
    expect(json.error).toBe('Já existe clínica com este CNPJ');
    expect(await clinicCount()).toBe(before);
  });

  it('Dada falha ao gravar a conta do admin, Quando criar, Então a falha ao gravar a conta desfaz a clínica', async () => {
    spyOnSentEmails();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DrizzleUserAccountRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories'
    );
    vi.spyOn(DrizzleUserAccountRepository.prototype, 'save').mockRejectedValue(
      new Error('banco caiu no meio'),
    );
    const cnpj = nextCnpj();
    const before = await clinicCount();

    const { response } = await create(
      validBody({ cnpj, adminEmail: 'rollback@x.com' }),
    );

    expect(response.status).toBe(500);
    expect(await clinicCount()).toBe(before);
    const { clinics } = await repositories('legacy-clinic');
    expect(await clinics.findByCnpj(cnpj)).toBeNull();
  });

  it('Dada falha ao gravar a auditoria, Quando criar, Então a falha desfaz clínica e conta juntas (#243)', async () => {
    const emails = spyOnSentEmails();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
      new Error('trilha fora do ar'),
    );
    const cnpj = nextCnpj();
    const before = await clinicCount();

    const { response } = await create(
      validBody({ cnpj, adminEmail: 'sem-trilha@x.com' }),
    );

    expect(response.status).toBe(500);
    expect(await clinicCount()).toBe(before);
    const { clinics } = await repositories('legacy-clinic');
    expect(await clinics.findByCnpj(cnpj)).toBeNull();
    expect(await accountsAnywhere('sem-trilha@x.com')).toEqual([]);
    expect(emails.bodies).toHaveLength(0);
  });

  it('Dada falha no envio do convite, Quando criar, Então 200 com delivered false e clínica e conta criadas', async () => {
    const { NullEmailGateway } = await import(
      '@/application/ports/email-gateway'
    );
    vi.spyOn(NullEmailGateway.prototype, 'send').mockRejectedValue(
      new Error('provedor fora do ar'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { response, json } = await create(
      validBody({ adminEmail: 'sem-email@x.com' }),
    );

    expect(response.status).toBe(200);
    expect(json.data.admin.delivered).toBe(false);
    const { clinics, userAccounts } = await repositories(json.data.clinic.id);
    expect(await clinics.findById(json.data.clinic.id)).not.toBeNull();
    expect(await userAccounts.findAllByEmail('sem-email@x.com')).toHaveLength(
      1,
    );
  });

  it('Dada a clínica criada, Quando registrar a auditoria da criação, Então clínica e conta ficam na trilha da clínica nova com o super_admin', async () => {
    spyOnSentEmails();

    const { json } = await create(validBody({ adminEmail: 'audit@x.com' }));

    const clinicId = json.data.clinic.id;
    const { auditEvents } = await repositories(clinicId);
    const events = await auditEvents.findAll();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'create',
          resourceType: 'clinic',
          resourceId: clinicId,
          actorRole: 'super_admin',
          actorId: 'dono@vitta.app',
          clinicId,
        }),
        expect.objectContaining({
          action: 'create',
          resourceType: 'account',
          resourceId: json.data.admin.id,
          actorRole: 'super_admin',
          clinicId,
        }),
      ]),
    );
  });

  it('Dadas clínicas com e sem admin, Quando listar, Então lista as clínicas por nome com cadastro e estado do admin', async () => {
    spyOnSentEmails();
    const pending = await create(
      validBody({ name: 'Zeta Estomaterapia', adminEmail: 'zeta@x.com' }),
    );
    const active = await create(
      validBody({ name: 'Alfa Feridas', adminEmail: 'alfa@x.com' }),
    );
    const { userAccounts } = await repositories(active.json.data.clinic.id);
    await userAccounts.updatePasswordHash(
      active.json.data.admin.id,
      'scrypt$1$abc$def',
    );

    const { response, json } = await list();

    expect(response.status).toBe(200);
    const names = json.data.map((row) => row.name);
    expect(names).toEqual(
      [...names].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    );
    expect(
      json.data.find((row) => row.id === active.json.data.clinic.id),
    ).toEqual({
      id: active.json.data.clinic.id,
      name: 'Alfa Feridas',
      cnpj: active.json.data.clinic.cnpj,
      registrationComplete: true,
      status: 'active',
      adminStatus: 'active',
      emailChannel: {
        configured: false,
        provider: null,
        lastStatus: null,
        lastStatusAt: null,
      },
      createdAt: expect.any(String),
    });
    expect(
      json.data.find((row) => row.id === pending.json.data.clinic.id)
        ?.adminStatus,
    ).toBe('pending');
    expect(json.data.find((row) => row.id === 'legacy-clinic')).toMatchObject({
      registrationComplete: false,
      adminStatus: 'none',
    });
  });
});
