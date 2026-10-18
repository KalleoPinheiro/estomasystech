import { beforeAll, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

let seq = 0;

const seed = async (
  role: UserRole,
  opts: { clinicId?: string; mfa?: boolean; active?: boolean } = {},
) => {
  const clinicId = opts.clinicId ?? CLINIC_A_ID;
  const { userAccounts, mfa } = await getRepositories(clinicScope(clinicId));
  const created = UserAccount.create({
    email: `reset-mfa-${++seq}@${clinicId}.test`,
    passwordHash: 'scrypt$1$abc$def',
    role,
    clinicId,
  });
  const account = opts.active === false ? created.deactivate() : created;
  await userAccounts.save(account);
  if (opts.mfa !== false) {
    await mfa.completeEnrollment({
      accountId: account.id,
      secret: 'JBSWY3DPEHPK3PXP',
      step: 1,
      recoveryCodeHashes: ['h1', 'h2'],
      expectedSessionVersion: 0,
      now: new Date(),
    });
  }
  return account;
};

const admin = () =>
  cookieHeaderFor(
    'company_admin',
    `admin-reset-mfa-${++seq}@a.test`,
    CLINIC_A_ID,
  );

const resetMfa = async (id: string, headers: Record<string, string>) => {
  const route = await import('@/app/api/accounts/[id]/reset-mfa/route');
  const response = await route.POST(
    jsonRequest(`/api/accounts/${id}/reset-mfa`, 'POST', undefined, headers),
    { params: Promise.resolve({ id }) },
  );
  return { response, json: (await response.json()) as Envelope<unknown> };
};

const state = async (account: UserAccount) => {
  const { userAccounts, mfa, auditEvents } = await getRepositories(
    clinicScope(account.clinicId as string),
  );
  return {
    factor: await mfa.findFactor(account.id),
    codes: await mfa.listUnusedRecoveryCodes(account.id),
    version: (await userAccounts.findById(account.id))?.sessionVersion,
    audit: (
      await auditEvents.findAll({
        resourceType: 'account',
        resourceId: account.id,
      })
    ).map((event) => event.detail),
  };
};

describe('Feature: POST /api/accounts/[id]/reset-mfa (#295)', () => {
  beforeAll(async () => {
    await ensureTestClinics();
  });

  it('o Admin remove fator e códigos de recuperação de quem perdeu o celular, derruba as sessões e audita', async () => {
    const target = await seed('atendente');

    const { response } = await resetMfa(target.id, admin());

    expect(response.status).toBe(200);
    expect(await state(target)).toEqual({
      factor: null,
      codes: [],
      version: target.sessionVersion + 2,
      audit: ['reset-mfa'],
    });
  });

  it('fator do Profissional também; o ator da trilha é o Admin', async () => {
    const target = await seed('profissional');
    const actor = admin();

    const { response } = await resetMfa(target.id, actor);

    expect(response.status).toBe(200);
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    const [event] = await auditEvents.findAll({
      resourceType: 'account',
      resourceId: target.id,
    });
    expect(event.actorRole).toBe('company_admin');
    expect(event.detail).toBe('reset-mfa');
  });

  it('quem não é Admin de Empresa → 403, sem mudança', async () => {
    const target = await seed('profissional');

    const { response } = await resetMfa(
      target.id,
      cookieHeaderFor('atendente', 'recepcao-reset-mfa@a.test', CLINIC_A_ID),
    );

    expect(response.status).toBe(403);
    expect((await state(target)).factor).not.toBeNull();
  });

  it('conta de outra clínica → 404, sem mudança', async () => {
    const target = await seed('atendente', { clinicId: CLINIC_B_ID });

    const { response } = await resetMfa(target.id, admin());

    expect(response.status).toBe(404);
    expect((await state(target)).factor).not.toBeNull();
  });

  it('o Admin redefine o fator de outro Admin da clínica, mas não o próprio (400)', async () => {
    const other = await seed('company_admin');
    const self = await seed('company_admin');

    const ok = await resetMfa(other.id, admin());
    const own = await resetMfa(
      self.id,
      cookieHeaderFor('company_admin', self.email, CLINIC_A_ID),
    );

    expect(ok.response.status).toBe(200);
    expect(own.response.status).toBe(400);
    expect((await state(other)).factor).toBeNull();
    expect((await state(self)).factor).not.toBeNull();
  });

  it('conta sem fator → 409; conta desativada → 409', async () => {
    const without = await seed('atendente', { mfa: false });
    const inactive = await seed('atendente', { active: false });

    const none = await resetMfa(without.id, admin());
    const off = await resetMfa(inactive.id, admin());

    expect(none.response.status).toBe(409);
    expect(none.json.error).toBe('Esta conta não tem segundo fator cadastrado');
    expect(off.response.status).toBe(409);
    expect(off.json.error).toBe('Conta desativada');
    expect((await state(inactive)).factor).not.toBeNull();
  });

  it('falha de auditoria não mexe no fator nem nas sessões', async () => {
    const target = await seed('atendente');
    const { DrizzleAuditEventRepository } = await import(
      '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository'
    );
    const spy = vi
      .spyOn(DrizzleAuditEventRepository.prototype, 'save')
      .mockRejectedValue(new Error('auditoria indisponível'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { response } = await resetMfa(target.id, admin());
    spy.mockRestore();

    expect(response.status).toBe(500);
    const after = await state(target);
    expect(after.factor).not.toBeNull();
    expect(after.version).toBe(target.sessionVersion + 1);
  });

  it('o Admin sem fator volta ao cadastro do autenticador no próximo login', async () => {
    const target = await seed('company_admin');
    const { mfa } = await getRepositories(clinicScope(CLINIC_A_ID));
    const { startMfaLogin } = await import('@/application/auth/mfa-login');
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    const { currentDataCipher } = await import('@/infrastructure/container');
    const deps = {
      userAccounts,
      mfa,
      cipher: currentDataCipher(),
      authSecret: process.env.AUTH_SECRET as string,
      nowMs: Date.now(),
    };
    expect(await startMfaLogin(deps, target)).toHaveProperty('mfaRequired');

    await mfa.removeFactor(target.id);

    expect(await startMfaLogin(deps, target)).toHaveProperty(
      'mfaEnrollmentRequired',
    );
  });

  it('o Super Admin redefine o fator do Admin pela plataforma', async () => {
    const target = await seed('company_admin');
    const route = await import(
      '@/app/api/platform/clinics/[id]/admins/[accountId]/route'
    );

    const response = await route.PATCH(
      jsonRequest(
        `/api/platform/clinics/${CLINIC_A_ID}/admins/${target.id}`,
        'PATCH',
        { action: 'reset-mfa' },
        cookieHeaderFor('super_admin', 'dono@estomasystech.app', null),
      ),
      { params: Promise.resolve({ id: CLINIC_A_ID, accountId: target.id }) },
    );

    expect(response.status).toBe(200);
    const after = await state(target);
    expect(after.factor).toBeNull();
    expect(after.codes).toEqual([]);
    expect(after.audit).toEqual(['reset-mfa']);
  });
});
