import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { spyOnSentEmails } from '../support/email';
import {
  clearEmailChannels,
  providerCalls,
  saveEmailChannel,
  stubProviderFetch,
} from '../support/email-channel';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.estomasystech.test';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface ActionDto {
  id: string;
  email: string;
  active: boolean;
  passwordSet: boolean;
  delivered: boolean | null;
  inviteUrl: string | null;
}

const SUPER_ADMIN = cookieHeaderFor(
  'super_admin',
  'dono@estomasystech.app',
  null,
);

const repositories = async (clinicId: string) => {
  const { getRepositories } = await import('@/infrastructure/container');
  return getRepositories(clinicScope(clinicId));
};

let seq = 0;
const seedAccount = async (
  clinicId: string,
  opts: { role?: UserRole; password?: boolean; active?: boolean } = {},
) => {
  const account = UserAccount.create({
    email: `conta-${++seq}@${clinicId}.test`,
    passwordHash:
      opts.password === false ? UNSET_PASSWORD_HASH : 'scrypt$1$abc$def',
    role: opts.role ?? 'company_admin',
    clinicId,
    professionalId: null,
  });
  const stored = opts.active === false ? account.deactivate() : account;
  const { userAccounts } = await repositories(clinicId);
  await userAccounts.save(stored);
  return stored;
};

const stored = async (clinicId: string, id: string) => {
  const { userAccounts } = await repositories(clinicId);
  return userAccounts.findById(id);
};

const act = async (clinicId: string, accountId: string, body: unknown) => {
  const route = await import(
    '@/app/api/platform/clinics/[id]/admins/[accountId]/route'
  );
  const response = await route.PATCH(
    jsonRequest(
      `/api/platform/clinics/${clinicId}/admins/${accountId}`,
      'PATCH',
      body,
      SUPER_ADMIN,
    ),
    { params: Promise.resolve({ id: clinicId, accountId }) },
  );
  return { response, json: (await response.json()) as Envelope<ActionDto> };
};

/** Clínica nova, sem admin nenhum — isola a regra do "último ativo". */
const freshClinic = async () => {
  await ensureTestClinics();
  const { Clinic } = await import('@/domain/clinic/clinic');
  const clinic = Clinic.restore({
    id: `acoes-${++seq}`,
    name: 'Clínica das ações',
    createdBy: 'test',
    createdAt: new Date(),
  });
  const { clinics } = await repositories(clinic.id);
  await clinics.create(clinic);
  return clinic.id;
};

describe('Feature: Gestão de admins pela plataforma (B4, Journey 4 e 5)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado admin pendente, Quando o super_admin reenvia o convite, Então tenta o e-mail e, sem canal, devolve o link; desativado recebe 400', async () => {
    const clinicId = await freshClinic();
    const pending = await seedAccount(clinicId, { password: false });
    const inactive = await seedAccount(clinicId, { active: false });
    const emails = spyOnSentEmails();

    const { response, json } = await act(clinicId, pending.id, {
      action: 'resend-invite',
    });

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      id: pending.id,
      email: pending.email,
      active: true,
      passwordSet: false,
      // Clínica sem canal: o e-mail não sai e o link volta (C2, #265).
      delivered: false,
      inviteUrl: expect.stringMatching(/\/definir-senha\?token=/),
    });
    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain(pending.email);
    expect(emails.bodies[0]).toMatch(/definir-senha\?token=/);

    const refused = await act(clinicId, inactive.id, {
      action: 'resend-invite',
    });
    expect(refused.response.status).toBe(400);
    expect(refused.json.error).toBe(
      'Conta desativada não pode receber convite',
    );
    expect(emails.bodies).toHaveLength(1);
  });

  it('Dado outro admin ativo, Quando desativa o admin, Então 200, conta inativa e sessões revogadas', async () => {
    const clinicId = await freshClinic();
    const leaving = await seedAccount(clinicId);
    await seedAccount(clinicId, { password: false });
    const versionBefore = leaving.sessionVersion;

    const { response, json } = await act(clinicId, leaving.id, {
      action: 'deactivate',
    });

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      id: leaving.id,
      active: false,
      delivered: null,
    });
    const after = await stored(clinicId, leaving.id);
    expect(after?.isActive).toBe(false);
    expect(after?.sessionVersion).toBe(versionBefore + 1);
  });

  it('Dado o último admin ativo, Quando desativar, Então último admin ativo responde 409 e nada muda', async () => {
    const clinicId = await freshClinic();
    const only = await seedAccount(clinicId);
    await seedAccount(clinicId, { active: false });

    const { response, json } = await act(clinicId, only.id, {
      action: 'deactivate',
    });

    expect(response.status).toBe(409);
    expect(json.error).toBe(
      'Não é possível desativar o último administrador ativo da empresa',
    );
    expect((await stored(clinicId, only.id))?.isActive).toBe(true);
  });

  it('Dado admin desativado, Quando reativa o admin, Então 200 e conta ativa', async () => {
    const clinicId = await freshClinic();
    const inactive = await seedAccount(clinicId, { active: false });

    const { response, json } = await act(clinicId, inactive.id, {
      action: 'reactivate',
    });

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ active: true, delivered: null });
    expect((await stored(clinicId, inactive.id))?.isActive).toBe(true);
  });

  it('Dada conta que não é admin daquela clínica, Quando agir, Então só admin da clínica é alvo (404) e nada muda', async () => {
    await ensureTestClinics();
    const attendant = await seedAccount(CLINIC_B_ID, { role: 'atendente' });
    const otherClinicAdmin = await seedAccount(CLINIC_A_ID, { active: false });
    const cases = [
      [attendant.id, 'Admin não encontrado'],
      [otherClinicAdmin.id, 'Admin não encontrado'],
      ['conta-inexistente', 'Admin não encontrado'],
    ] as const;

    for (const [accountId, message] of cases) {
      const { response, json } = await act(CLINIC_B_ID, accountId, {
        action: 'deactivate',
      });
      expect(response.status).toBe(404);
      expect(json.error).toBe(message);
    }
    const reactivated = await act(CLINIC_B_ID, otherClinicAdmin.id, {
      action: 'reactivate',
    });
    expect(reactivated.response.status).toBe(404);
    expect((await stored(CLINIC_B_ID, attendant.id))?.isActive).toBe(true);
    expect((await stored(CLINIC_A_ID, otherClinicAdmin.id))?.isActive).toBe(
      false,
    );

    const noClinic = await act('nao-existe', attendant.id, {
      action: 'reactivate',
    });
    expect(noClinic.response.status).toBe(404);
    expect(noClinic.json.error).toBe('Clínica não encontrada');
  });

  it.each([
    ['ação desconhecida', { action: 'promote' }],
    ['sem ação', {}],
  ])(
    'Dado %s, Quando agir, Então ação inválida responde 400',
    async (_label, body) => {
      const clinicId = await freshClinic();
      const admin = await seedAccount(clinicId);

      const { response } = await act(clinicId, admin.id, body);

      expect(response.status).toBe(400);
      expect((await stored(clinicId, admin.id))?.isActive).toBe(true);
    },
  );

  it.each([
    ['resend-invite', { password: false }],
    ['deactivate', {}],
    ['reactivate', { active: false }],
  ] as const)(
    'Dada a ação %s, Quando agir, Então grava a auditoria das ações na clínica-alvo antes de mudar',
    async (action, opts) => {
      const clinicId = await freshClinic();
      const target = await seedAccount(clinicId, opts);
      await seedAccount(clinicId);
      spyOnSentEmails();

      const { response } = await act(clinicId, target.id, { action });

      expect(response.status).toBe(200);
      const { auditEvents } = await repositories(clinicId);
      expect(await auditEvents.findAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'update',
            resourceType: 'account',
            resourceId: target.id,
            detail: action,
            actorRole: 'super_admin',
            actorId: 'dono@estomasystech.app',
            clinicId,
          }),
        ]),
      );
    },
  );

  it('Dada a auditoria falhou, Quando desativar ou reenviar, Então a conta não muda e nenhum e-mail sai', async () => {
    const clinicId = await freshClinic();
    const leaving = await seedAccount(clinicId, { password: false });
    await seedAccount(clinicId);
    const emails = spyOnSentEmails();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
      new Error('trilha fora do ar'),
    );

    const deactivate = await act(clinicId, leaving.id, {
      action: 'deactivate',
    });
    const resend = await act(clinicId, leaving.id, {
      action: 'resend-invite',
    });

    expect(deactivate.response.status).toBe(500);
    expect(resend.response.status).toBe(500);
    const after = await stored(clinicId, leaving.id);
    expect(after?.isActive).toBe(true);
    expect(after?.sessionVersion).toBe(leaving.sessionVersion);
    expect(emails.bodies).toHaveLength(0);
  });

  describe('C2/#265 link do reenvio e reset-link', () => {
    const LINK =
      /^https:\/\/app\.estomasystech\.test\/definir-senha\?token=[\w-]+$/;

    afterEach(async () => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await clearEmailChannels();
    });

    const tokenOf = (url: string | null) =>
      new URL(url ?? 'https://x.test').searchParams.get('token') ?? '';

    it('link do reenvio: sem canal devolve o link; canal que entrega sai pela chave da clínica-alvo sem link; canal que falha devolve o link', async () => {
      const clinicId = await freshClinic();
      const pending = await seedAccount(clinicId, { password: false });
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const fetchMock = stubProviderFetch(200);
      const none = await act(clinicId, pending.id, { action: 'resend-invite' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(none.json.data).toMatchObject({ delivered: false });
      expect(none.json.data.inviteUrl).toMatch(LINK);

      await saveEmailChannel(clinicId, 're_chave_alvo');
      const sent = await act(clinicId, pending.id, { action: 'resend-invite' });
      expect(sent.json.data).toMatchObject({
        delivered: true,
        inviteUrl: null,
      });
      expect(providerCalls(fetchMock)).toEqual([
        expect.objectContaining({
          auth: 'Bearer re_chave_alvo',
          to: pending.email,
        }),
      ]);

      stubProviderFetch(422);
      const failed = await act(clinicId, pending.id, {
        action: 'resend-invite',
      });
      expect(failed.response.status).toBe(200);
      expect(failed.json.data.delivered).toBe(false);
      expect(failed.json.data.inviteUrl).toMatch(LINK);
    });

    it('reset-link: emite token reset de 1 h e, sem canal, devolve o link; conta desativada recebe 409', async () => {
      const clinicId = await freshClinic();
      const admin = await seedAccount(clinicId);
      const inactive = await seedAccount(clinicId, { active: false });
      spyOnSentEmails();
      const before = Date.now();

      const { response, json } = await act(clinicId, admin.id, {
        action: 'reset-link',
      });

      expect(response.status).toBe(200);
      expect(json.data).toMatchObject({
        id: admin.id,
        delivered: false,
      });
      expect(json.data.inviteUrl).toMatch(LINK);
      const { hashAuthTokenSecret, RESET_TTL_MS } = await import(
        '@/domain/auth/auth-token'
      );
      const { authTokens } = await repositories(clinicId);
      const hash = hashAuthTokenSecret(tokenOf(json.data.inviteUrl));
      expect(
        await authTokens.claimBySecretHash(hash, Date.now() + RESET_TTL_MS + 1),
      ).toBeNull();
      const token = await authTokens.claimBySecretHash(
        hash,
        before + RESET_TTL_MS - 60_000,
      );
      expect(token?.purpose).toBe('reset');
      expect(token?.accountId).toBe(admin.id);

      const refused = await act(clinicId, inactive.id, {
        action: 'reset-link',
      });
      expect(refused.response.status).toBe(409);
      expect(refused.json.error).toBe('Conta desativada');
    });

    it('reset-link com canal: sai pela chave da clínica-alvo sem link, invalida o link anterior e, com não-2xx, devolve o link', async () => {
      const clinicId = await freshClinic();
      const admin = await seedAccount(clinicId);
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const first = await act(clinicId, admin.id, { action: 'reset-link' });

      await saveEmailChannel(clinicId, 're_chave_alvo');
      const fetchMock = stubProviderFetch(200);
      const sent = await act(clinicId, admin.id, { action: 'reset-link' });
      expect(sent.json.data).toMatchObject({
        delivered: true,
        inviteUrl: null,
      });
      expect(providerCalls(fetchMock)).toEqual([
        expect.objectContaining({
          auth: 'Bearer re_chave_alvo',
          to: admin.email,
        }),
      ]);
      const { hashAuthTokenSecret } = await import('@/domain/auth/auth-token');
      const { authTokens } = await repositories(clinicId);
      expect(
        await authTokens.claimBySecretHash(
          hashAuthTokenSecret(tokenOf(first.json.data.inviteUrl)),
        ),
      ).toBeNull();

      stubProviderFetch(500);
      const failed = await act(clinicId, admin.id, { action: 'reset-link' });
      expect(failed.response.status).toBe(200);
      expect(failed.json.data.delivered).toBe(false);
      expect(failed.json.data.inviteUrl).toMatch(LINK);
    });

    it('reset-link auditado: trilha da clínica com detail reset-link e, em produção, nem link nem segredo na trilha ou no log', async () => {
      const clinicId = await freshClinic();
      const admin = await seedAccount(clinicId);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64));
      const logged: string[] = [];
      for (const level of ['info', 'warn', 'error', 'log'] as const) {
        vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
          logged.push(args.map(String).join(' '));
        });
      }

      const { response, json } = await act(clinicId, admin.id, {
        action: 'reset-link',
      });

      expect(response.status).toBe(200);
      const secret = tokenOf(json.data.inviteUrl);
      expect(secret).not.toBe('');
      const { auditEvents } = await repositories(clinicId);
      const events = await auditEvents.findAll();
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'update',
            resourceType: 'account',
            resourceId: admin.id,
            detail: 'reset-link',
            clinicId,
          }),
        ]),
      );
      const trail = JSON.stringify(events);
      expect(trail).not.toContain(secret);
      expect(trail).not.toContain('definir-senha');
      expect(logged.join('\n')).not.toContain(secret);
      expect(logged.join('\n')).not.toContain('definir-senha');
    });
  });
});
