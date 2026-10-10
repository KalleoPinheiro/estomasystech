import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_B_ID,
  completeClinicRegistration,
  ensureTestClinics,
} from '../support/clinics';
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

interface AdminDto {
  id: string;
  email: string;
  role: string;
  clinicId: string;
  active: boolean;
  passwordSet: boolean;
  professionalId: string | null;
  delivered: boolean;
  inviteUrl: string | null;
}

const SUPER_ADMIN = cookieHeaderFor('super_admin', 'dono@vitta.app', null);

/** Clínica B com o cadastro que o convite exige (B4). */
const ensureRegisteredClinicB = async () => {
  await ensureTestClinics();
  await completeClinicRegistration(CLINIC_B_ID);
};

const invite = async (clinicId: string, body: unknown) => {
  const route = await import('@/app/api/platform/clinics/[id]/admins/route');
  const response = await route.POST(
    jsonRequest(
      `/api/platform/clinics/${clinicId}/admins`,
      'POST',
      body,
      SUPER_ADMIN,
    ),
    { params: Promise.resolve({ id: clinicId }) },
  );
  const json = (await response.json()) as Envelope<AdminDto>;
  return { response, json };
};

const accountsWithEmail = async (clinicId: string, email: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  return userAccounts.findAllByEmail(email);
};

describe('Feature: Convite do primeiro Admin de Empresa pela plataforma (B1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado super_admin e clínica existente, Quando convidar, Então cria o company_admin na clínica sem senha e emite o convite', async () => {
    await ensureRegisteredClinicB();
    const emails = spyOnSentEmails();

    const { response, json } = await invite(CLINIC_B_ID, {
      email: 'primeiro-admin@b.com',
    });

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      id: expect.any(String),
      email: 'primeiro-admin@b.com',
      role: 'company_admin',
      clinicId: CLINIC_B_ID,
      active: true,
      passwordSet: false,
      professionalId: null,
      // Sem canal de e-mail na clínica (ADR-011): o link volta ao operador.
      delivered: false,
      inviteUrl: expect.stringMatching(
        /^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/,
      ),
    });
    const [stored] = await accountsWithEmail(
      CLINIC_B_ID,
      'primeiro-admin@b.com',
    );
    expect(stored?.clinicId).toBe(CLINIC_B_ID);
    expect(stored?.role).toBe('company_admin');
    expect(stored?.passwordHash).toBe(UNSET_PASSWORD_HASH);
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain('primeiro-admin@b.com');
    expect(emails.bodies[0]).toMatch(/definir-senha\?token=/);
  });

  it('Dado o e-mail entregue pelo canal da clínica, Quando convidar, Então inviteUrl é null e nada na resposta traz o link', async () => {
    await ensureRegisteredClinicB();
    const { getRepositories } = await import('@/infrastructure/container');
    const { ClinicChannel } = await import('@/domain/clinic/clinic-channel');
    const { clinicChannels } = await getRepositories(clinicScope(CLINIC_B_ID));
    await clinicChannels.save(
      ClinicChannel.configure({
        clinicId: CLINIC_B_ID,
        channel: 'email',
        provider: 'resend',
        sender: 'Clínica B <contato@b.test>',
        apiKey: 're_chave_da_b',
        by: 'admin@b.test',
      }),
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    try {
      const { response, json } = await invite(CLINIC_B_ID, {
        email: 'com-canal@b.com',
      });

      expect(response.status).toBe(200);
      expect(json.data.delivered).toBe(true);
      expect(json.data.inviteUrl).toBeNull();
      expect(JSON.stringify(json)).not.toMatch(/token|definir-senha/);
    } finally {
      vi.unstubAllGlobals();
      await clinicChannels.remove('email');
    }
  });

  it('Dada falha do provedor, Quando convidar, Então delivered é false e inviteUrl traz o link de 24 h', async () => {
    await ensureRegisteredClinicB();
    const { NullEmailGateway } = await import(
      '@/application/ports/email-gateway'
    );
    vi.spyOn(NullEmailGateway.prototype, 'send').mockRejectedValue(
      new Error('provedor fora do ar'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { response, json } = await invite(CLINIC_B_ID, {
      email: 'sem-entrega@b.com',
    });

    expect(response.status).toBe(200);
    expect(json.data.delivered).toBe(false);
    expect(json.data.inviteUrl).toMatch(
      /^https:\/\/app\.vitta\.test\/definir-senha\?token=[\w-]+$/,
    );
  });

  it('Dada clínica inexistente, Quando convidar, Então clínica inexistente responde 404 e nenhuma conta é criada', async () => {
    const { response, json } = await invite('clinica-que-nao-existe', {
      email: 'orfao@x.com',
    });

    expect(response.status).toBe(404);
    expect(json.error).toBe('Clínica não encontrada');
    expect(
      await accountsWithEmail('clinica-que-nao-existe', 'orfao@x.com'),
    ).toEqual([]);
  });

  it.each([
    ['sem email', {}, 400],
    ['email numérico', { email: 12345 }, 400],
    ['email com 2 caracteres', { email: 'ab' }, 400],
    ['email com 201 caracteres', { email: 'a'.repeat(201) }, 400],
    // Bem formados: só o limite de tamanho da rota decide.
    [
      'email válido com 201 caracteres',
      { email: `${'a'.repeat(195)}@b.com` },
      400,
    ],
    // 3 caracteres passa no limite, mas nenhum e-mail válido tem menos de 5
    // (`a@b.c`): o formato do domínio responde 400.
    ['email com 3 caracteres', { email: 'a@b' }, 400],
    ['email válido com 5 caracteres', { email: 'a@b.c' }, 200],
    ['email com 200 caracteres', { email: `${'a'.repeat(194)}@b.com` }, 200],
  ])(
    'Dado %s, Quando convidar, Então valida o e-mail (%s → %i)',
    async (_label, body, status) => {
      await ensureRegisteredClinicB();
      spyOnSentEmails();

      const { response } = await invite(CLINIC_B_ID, body);

      expect(response.status).toBe(status);
    },
  );

  it('Dado e-mail repetido na clínica, Quando convidar de novo, Então 400 e continua uma conta só', async () => {
    await ensureRegisteredClinicB();
    spyOnSentEmails();
    await invite(CLINIC_B_ID, { email: 'repetido@b.com' });

    const { response, json } = await invite(CLINIC_B_ID, {
      email: 'repetido@b.com',
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe('Já existe conta com este email');
    expect(await accountsWithEmail(CLINIC_B_ID, 'repetido@b.com')).toHaveLength(
      1,
    );
  });

  it('Dadas duas requisições concorrentes com o mesmo e-mail, Quando convidar, Então uma 200, outra 400 e uma conta só', async () => {
    await ensureRegisteredClinicB();
    spyOnSentEmails();

    const results = await Promise.all([
      invite(CLINIC_B_ID, { email: 'corrida@b.com' }),
      invite(CLINIC_B_ID, { email: 'corrida@b.com' }),
    ]);

    const statuses = results.map((r) => r.response.status).sort();
    expect(statuses).toEqual([200, 400]);
    const loser = results.find((r) => r.response.status === 400);
    expect(loser?.json.error).toBe('Já existe conta com este email');
    expect(await accountsWithEmail(CLINIC_B_ID, 'corrida@b.com')).toHaveLength(
      1,
    );
  });

  it('Dada a checagem prévia vencida pela corrida, Quando o índice recusa, Então a violação 23505 vira 400', async () => {
    await ensureRegisteredClinicB();
    spyOnSentEmails();
    await invite(CLINIC_B_ID, { email: 'indice@b.com' });
    const { DrizzleUserAccountRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories'
    );
    // Simula a outra requisição: a leitura ainda não via a conta gravada.
    vi.spyOn(
      DrizzleUserAccountRepository.prototype,
      'findByEmail',
    ).mockResolvedValue(null);

    const { response, json } = await invite(CLINIC_B_ID, {
      email: 'indice@b.com',
    });

    expect(response.status).toBe(400);
    expect(json.error).toBe('Já existe conta com este email');
    vi.restoreAllMocks();
    expect(await accountsWithEmail(CLINIC_B_ID, 'indice@b.com')).toHaveLength(
      1,
    );
  });

  it('Dada falha no envio do e-mail, Quando convidar, Então a conta fica criada, delivered é false e o convite pode ser reenviado', async () => {
    await ensureRegisteredClinicB();
    const { NullEmailGateway } = await import(
      '@/application/ports/email-gateway'
    );
    vi.spyOn(NullEmailGateway.prototype, 'send').mockRejectedValue(
      new Error('provedor fora do ar'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { response, json } = await invite(CLINIC_B_ID, {
      email: 'falhou@b.com',
    });

    expect(response.status).toBe(200);
    expect(json.data.delivered).toBe(false);
    const [stored] = await accountsWithEmail(CLINIC_B_ID, 'falhou@b.com');
    expect(stored?.isActive).toBe(true);
    expect(stored?.passwordHash).toBe(UNSET_PASSWORD_HASH);

    vi.restoreAllMocks();
    const emails = spyOnSentEmails();
    const resend = await import('@/app/api/accounts/[id]/resend-invite/route');
    const resent = await resend.POST(
      jsonRequest(
        `/api/accounts/${json.data.id}/resend-invite`,
        'POST',
        {},
        cookieHeaderFor('company_admin', 'outro-admin@b.com', CLINIC_B_ID),
      ),
      { params: Promise.resolve({ id: json.data.id }) },
    );
    expect(resent.status).toBe(200);
    expect(emails.bodies.at(-1)).toContain('falhou@b.com');
  });

  it('Dado o convite criado, Quando registrar auditoria, Então o evento fica na clínica com o super_admin como ator', async () => {
    await ensureRegisteredClinicB();
    spyOnSentEmails();

    const { json } = await invite(CLINIC_B_ID, { email: 'auditado@b.com' });

    const { getRepositories } = await import('@/infrastructure/container');
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_B_ID));
    const events = await auditEvents.findAll();
    const event = events.find(
      (e) => e.resourceType === 'account' && e.resourceId === json.data.id,
    );
    expect(event).toMatchObject({
      action: 'create',
      resourceType: 'account',
      resourceId: json.data.id,
      actorRole: 'super_admin',
      actorId: 'dono@vitta.app',
      clinicId: CLINIC_B_ID,
    });
  });

  it('Dada a auditoria falhou, Quando convidar, Então nada é gravado — nem a conta, nem o convite sai (#243)', async () => {
    await ensureRegisteredClinicB();
    const emails = spyOnSentEmails();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
      new Error('trilha fora do ar'),
    );

    const { response } = await invite(CLINIC_B_ID, {
      email: 'sem-trilha@b.com',
    });

    expect(response.status).toBe(500);
    expect(await accountsWithEmail(CLINIC_B_ID, 'sem-trilha@b.com')).toEqual(
      [],
    );
    expect(emails.bodies).toHaveLength(0);
  });
});

const listAdmins = async (clinicId: string) => {
  const route = await import('@/app/api/platform/clinics/[id]/admins/route');
  const response = await route.GET(
    jsonRequest(
      `/api/platform/clinics/${clinicId}/admins`,
      'GET',
      undefined,
      SUPER_ADMIN,
    ),
    { params: Promise.resolve({ id: clinicId }) },
  );
  const json = (await response.json()) as Envelope<
    { id: string; email: string; active: boolean; passwordSet: boolean }[]
  >;
  return { response, json };
};

const seedAccount = async (clinicId: string, email: string, role: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  const { UserAccount } = await import('@/domain/auth/user-account');
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  const account = UserAccount.create({
    email,
    passwordHash: 'scrypt$1$abc$def',
    role: role as 'company_admin',
    clinicId,
    professionalId: null,
  });
  await userAccounts.save(account);
  return account;
};

describe('Feature: Admins da clínica na plataforma (B4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dada clínica com admins, equipe e portal, Quando listar, Então lista só os admins da clínica', async () => {
    await ensureRegisteredClinicB();
    const admin = await seedAccount(
      CLINIC_B_ID,
      'lista-admin@b.com',
      'company_admin',
    );
    await seedAccount(CLINIC_B_ID, 'lista-atendente@b.com', 'atendente');
    await seedAccount(CLINIC_B_ID, 'lista-paciente@b.com', 'patient');
    await seedAccount('legacy-clinic', 'lista-admin-a@a.com', 'company_admin');

    const { response, json } = await listAdmins(CLINIC_B_ID);

    expect(response.status).toBe(200);
    const emails = json.data.map((row) => row.email);
    expect(emails).toContain('lista-admin@b.com');
    expect(emails).not.toContain('lista-atendente@b.com');
    expect(emails).not.toContain('lista-paciente@b.com');
    expect(emails).not.toContain('lista-admin-a@a.com');
    expect(json.data.find((row) => row.id === admin.id)).toEqual({
      id: admin.id,
      email: 'lista-admin@b.com',
      active: true,
      passwordSet: true,
    });

    const missing = await listAdmins('clinica-que-nao-existe');
    expect(missing.response.status).toBe(404);
    expect(missing.json.error).toBe('Clínica não encontrada');
  });

  it('Dada clínica com cadastro incompleto, Quando convidar, Então o cadastro incompleto bloqueia o convite até ser completado', async () => {
    const { getRepositories } = await import('@/infrastructure/container');
    const { Clinic } = await import('@/domain/clinic/clinic');
    const { clinics } = await getRepositories(clinicScope('gate-clinic'));
    await clinics.create(
      Clinic.restore({
        id: 'gate-clinic',
        name: 'Clínica do go-live',
        createdBy: 'test',
        createdAt: new Date(),
      }),
    );
    spyOnSentEmails();

    const blocked = await invite('gate-clinic', { email: 'gate@x.com' });

    expect(blocked.response.status).toBe(400);
    expect(blocked.json.error).toBe(
      'Complete o cadastro da clínica (nome, CNPJ, telefone e e-mail de contato) antes de convidar o admin',
    );
    expect(await accountsWithEmail('gate-clinic', 'gate@x.com')).toEqual([]);

    await completeClinicRegistration('gate-clinic');
    const allowed = await invite('gate-clinic', { email: 'gate@x.com' });
    expect(allowed.response.status).toBe(200);
    expect(await accountsWithEmail('gate-clinic', 'gate@x.com')).toHaveLength(
      1,
    );
  });
});
