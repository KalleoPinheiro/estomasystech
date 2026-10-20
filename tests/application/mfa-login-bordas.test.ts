import { describe, expect, it, vi } from 'vitest';
import {
  beginEnrollment,
  type MfaDeps,
  resolvePendingLogin,
  startMfaLogin,
  verifyMfaCode,
} from '@/application/auth/mfa-login';
import type { MfaRepository } from '@/domain/auth/mfa';
import { totpCode, totpStep } from '@/domain/auth/totp';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import { createMfaPendingToken } from '@/lib/auth/mfa-pending-token';
import { DataCipher } from '@/lib/data-cipher';

const AUTH_SECRET = 'vitest-auth-secret-0000000000000000';
const NOW = Date.parse('2026-10-20T12:00:00Z');

const account = (role: 'company_admin' | 'patient') =>
  UserAccount.restore({
    id: `acc-${role}`,
    email: `${role}@clinica.com`,
    passwordHash: 'scrypt$1$s$h',
    role,
    clinicId: 'clinic-1',
    active: true,
    createdAt: new Date(NOW),
    sessionVersion: 0,
  });

const comPendente = <T>(pending: T | null): T => {
  if (!pending) throw new Error('login pendente esperado');
  return pending;
};

const deps = (overrides: Partial<MfaRepository> = {}): MfaDeps => ({
  userAccounts: {
    findById: async () => null,
  } as unknown as UserAccountRepository,
  mfa: {
    findFactor: async () => null,
    claimStep: async () => false,
    completeEnrollment: async () => false,
    ...overrides,
  } as MfaRepository,
  cipher: new DataCipher({
    current: 'k'.repeat(32),
    previous: [],
    legacyAuthSecret: null,
  }),
  authSecret: AUTH_SECRET,
  nowMs: NOW,
});

describe('Feature: Login em duas etapas nas bordas (ADR-008)', () => {
  it('Dado conta de portal (paciente), Quando iniciar o login, Então a senha basta e não há segundo fator', async () => {
    const findFactor = vi.fn(async () => null);
    expect(
      await startMfaLogin(deps({ findFactor }), account('patient')),
    ).toBeNull();
    expect(findFactor).not.toHaveBeenCalled();
  });

  it('Dado que o autenticador foi removido depois da senha, Quando enviar o código, Então a verificação expirou', async () => {
    const admin = account('company_admin');
    const token = createMfaPendingToken(
      AUTH_SECRET,
      { accountId: admin.id, sessionVersion: 0, stage: 'verify' },
      NOW,
    );
    const d = deps();
    d.userAccounts = {
      findById: async () => admin,
    } as unknown as UserAccountRepository;
    const pending = await resolvePendingLogin(d, token, ['verify']);
    expect(pending).not.toBeNull();

    expect(await verifyMfaCode(d, comPendente(pending), '123456')).toEqual({
      kind: 'expired',
    });
  });

  it('Dado token de confirmação sem a chave nova, Quando enviar o código, Então a verificação expirou', async () => {
    const admin = account('company_admin');
    const token = createMfaPendingToken(
      AUTH_SECRET,
      { accountId: admin.id, sessionVersion: 0, stage: 'confirm' },
      NOW,
    );
    const d = deps();
    d.userAccounts = {
      findById: async () => admin,
    } as unknown as UserAccountRepository;
    const pending = await resolvePendingLogin(d, token, ['confirm']);

    expect(await verifyMfaCode(d, comPendente(pending), '123456')).toEqual({
      kind: 'expired',
    });
  });

  it('Dado cadastro já consumido por outro acesso, Quando confirmar com o código certo, Então a verificação expirou e nenhuma sessão nasce', async () => {
    const admin = account('company_admin');
    const d = deps({ completeEnrollment: async () => false });
    const { secret, pendingToken } = beginEnrollment(d, { account: admin });
    d.userAccounts = {
      findById: async () => admin,
    } as unknown as UserAccountRepository;
    const pending = await resolvePendingLogin(d, pendingToken, ['confirm']);
    const code = totpCode(secret, totpStep(NOW));

    expect(await verifyMfaCode(d, comPendente(pending), code)).toEqual({
      kind: 'expired',
    });
  });
});
