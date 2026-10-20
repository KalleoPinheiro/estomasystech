import { describe, expect, it, vi } from 'vitest';
import {
  beginEnrollment,
  INVALID_CODE_MESSAGE,
  INVALID_RECOVERY_CODE_MESSAGE,
  MFA_BODY_MESSAGE,
  MFA_EXPIRED_MESSAGE,
  type MfaDeps,
  redeemRecoveryCode,
  resolvePendingLogin,
  startMfaLogin,
  verifyMfaCode,
} from '@/application/auth/mfa-login';
import type { MfaFactor, MfaRepository } from '@/domain/auth/mfa';
import { generateTotpSecret, totpCode, totpStep } from '@/domain/auth/totp';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import {
  createMfaPendingToken,
  type MfaStage,
  verifyMfaPendingToken,
} from '@/lib/auth/mfa-pending-token';
import { hashRecoveryCode } from '@/lib/auth/mfa-recovery-codes';
import { DataCipher } from '@/lib/data-cipher';

const AUTH_SECRET = 'vitest-auth-secret-0000000000000000';
const NOW = Date.parse('2026-10-20T12:00:00Z');

const account = (
  role: UserRole,
  overrides: { active?: boolean; sessionVersion?: number } = {},
) =>
  UserAccount.restore({
    id: `acc-${role}`,
    email: `${role}@clinica.com`,
    passwordHash: 'scrypt$1$s$h',
    role,
    clinicId: 'clinic-1',
    active: overrides.active ?? true,
    createdAt: new Date(NOW),
    sessionVersion: overrides.sessionVersion ?? 3,
  });

interface Setup {
  factor?: MfaFactor | null;
  claimStep?: boolean;
  completeEnrollment?: boolean;
  recoveryRecords?: { id: string; codeHash: string }[];
  claimRecovery?: boolean;
  stored?: UserAccount | null;
}

function build(setup: Setup = {}) {
  const repo = {
    findFactor: vi.fn(async () => setup.factor ?? null),
    claimStep: vi.fn(async () => setup.claimStep ?? true),
    completeEnrollment: vi.fn(async () => setup.completeEnrollment ?? true),
    listUnusedRecoveryCodes: vi.fn(async () => setup.recoveryRecords ?? []),
    claimRecoveryCode: vi.fn(async () => setup.claimRecovery ?? true),
  };
  const deps: MfaDeps = {
    userAccounts: {
      findById: async () => setup.stored ?? null,
    } as unknown as UserAccountRepository,
    mfa: repo as unknown as MfaRepository,
    cipher: new DataCipher({
      current: 'k'.repeat(32),
      previous: [],
      legacyAuthSecret: null,
    }),
    authSecret: AUTH_SECRET,
    nowMs: NOW,
  };
  return { deps, repo };
}

const tokenFor = (
  acc: UserAccount,
  stage: MfaStage,
  extra: { sessionVersion?: number; encryptedSecret?: string } = {},
) =>
  createMfaPendingToken(
    AUTH_SECRET,
    {
      accountId: acc.id,
      sessionVersion: extra.sessionVersion ?? acc.sessionVersion,
      stage,
      encryptedSecret: extra.encryptedSecret,
    },
    NOW,
  );

const factor = (overrides: Partial<MfaFactor> = {}): MfaFactor => ({
  accountId: 'acc-company_admin',
  secret: generateTotpSecret(),
  enrolledAt: new Date(NOW),
  lastUsedStep: 0,
  ...overrides,
});

describe('Feature: Login em duas etapas (mutação, #406)', () => {
  it('Dado as mensagens do fluxo, Então o texto é o que o usuário lê', () => {
    expect(MFA_EXPIRED_MESSAGE).toBe(
      'Verificação expirada. Entre novamente com e-mail e senha.',
    );
    expect(INVALID_CODE_MESSAGE).toBe('Código inválido');
    expect(INVALID_RECOVERY_CODE_MESSAGE).toBe(
      'Código de recuperação inválido',
    );
    expect(MFA_BODY_MESSAGE).toBe(
      'Informe o código de 6 dígitos ou um código de recuperação',
    );
  });

  describe('Cenário: início do login', () => {
    it('Dado admin com autenticador, Quando entra com a senha, Então pede o código e o token é da etapa verify', async () => {
      const admin = account('company_admin');
      const { deps } = build({ factor: factor() });
      const res = await startMfaLogin(deps, admin);
      expect(res).toMatchObject({ mfaRequired: true });
      const token = verifyMfaPendingToken(
        AUTH_SECRET,
        (res as { pendingToken: string }).pendingToken,
        NOW,
      );
      expect(token).toMatchObject({
        accountId: admin.id,
        stage: 'verify',
        sessionVersion: 3,
      });
    });

    it('Dado admin sem autenticador, Quando entra com a senha, Então exige cadastro e o token é da etapa enroll', async () => {
      const admin = account('company_admin');
      const { deps } = build();
      const res = await startMfaLogin(deps, admin);
      expect(res).toMatchObject({ mfaEnrollmentRequired: true });
      const token = verifyMfaPendingToken(
        AUTH_SECRET,
        (res as { pendingToken: string }).pendingToken,
        NOW,
      );
      expect(token?.stage).toBe('enroll');
    });

    it('Dado atendente (2FA opcional) sem autenticador, Então a senha basta', async () => {
      const { deps } = build();
      expect(await startMfaLogin(deps, account('atendente'))).toBeNull();
    });

    it('Dado atendente com autenticador, Então pede o código', async () => {
      const { deps } = build({ factor: factor() });
      expect(await startMfaLogin(deps, account('atendente'))).toMatchObject({
        mfaRequired: true,
      });
    });
  });

  describe('Cenário: token pendente', () => {
    const resolve = async (
      acc: UserAccount | null,
      token: string | undefined,
      stages: MfaStage[] = ['verify'],
    ) => resolvePendingLogin(build({ stored: acc }).deps, token, stages);

    it('Dado token válido de conta apta, Então resolve o login pendente', async () => {
      const admin = account('company_admin');
      const pending = await resolve(admin, tokenFor(admin, 'verify'));
      expect(pending?.account.id).toBe(admin.id);
      expect(pending?.token.stage).toBe('verify');
    });

    it('Dado token ausente ou adulterado, Então não resolve', async () => {
      const admin = account('company_admin');
      expect(await resolve(admin, undefined)).toBeNull();
      expect(await resolve(admin, `${tokenFor(admin, 'verify')}x`)).toBeNull();
    });

    it('Dado token de etapa que o passo não aceita, Então não resolve', async () => {
      const admin = account('company_admin');
      expect(
        await resolve(admin, tokenFor(admin, 'enroll'), ['verify']),
      ).toBeNull();
      expect(
        await resolve(admin, tokenFor(admin, 'confirm'), ['verify', 'enroll']),
      ).toBeNull();
    });

    it('Dado conta inexistente, desativada, de papel sem 2FA ou com sessão trocada, Então não resolve', async () => {
      const admin = account('company_admin');
      expect(await resolve(null, tokenFor(admin, 'verify'))).toBeNull();
      const inactive = account('company_admin', { active: false });
      expect(await resolve(inactive, tokenFor(inactive, 'verify'))).toBeNull();
      const patient = account('patient');
      expect(await resolve(patient, tokenFor(patient, 'verify'))).toBeNull();
      expect(
        await resolve(admin, tokenFor(admin, 'verify', { sessionVersion: 2 })),
      ).toBeNull();
    });
  });

  describe('Cenário: código do autenticador (etapa verify)', () => {
    const pendingFor = async (acc: UserAccount, setup: Setup) => {
      const { deps, repo } = build({ ...setup, stored: acc });
      const pending = await resolvePendingLogin(deps, tokenFor(acc, 'verify'), [
        'verify',
      ]);
      if (!pending) throw new Error('pendente esperado');
      return { deps, repo, pending };
    };

    it('Dado o código certo, Então abre a sessão e consome o passo', async () => {
      const admin = account('company_admin');
      const f = factor();
      const { deps, repo, pending } = await pendingFor(admin, { factor: f });
      const step = totpStep(NOW);
      const out = await verifyMfaCode(deps, pending, totpCode(f.secret, step));
      expect(out).toEqual({
        kind: 'session',
        account: admin,
        sessionVersion: 3,
        detail: 'mfa_verified',
      });
      expect(repo.claimStep).toHaveBeenCalledWith(admin.id, step);
    });

    it('Dado código errado, Então rejeita com a mensagem e o detalhe de auditoria', async () => {
      const admin = account('company_admin');
      const f = factor();
      const { deps, pending } = await pendingFor(admin, { factor: f });
      const wrong = totpCode(f.secret, totpStep(NOW) + 10);
      expect(await verifyMfaCode(deps, pending, wrong)).toEqual({
        kind: 'rejected',
        account: admin,
        message: INVALID_CODE_MESSAGE,
        detail: 'mfa_invalid_code',
      });
    });

    it('Dado código certo já consumido por outro acesso, Então rejeita', async () => {
      const admin = account('company_admin');
      const f = factor();
      const { deps, pending } = await pendingFor(admin, {
        factor: f,
        claimStep: false,
      });
      const out = await verifyMfaCode(
        deps,
        pending,
        totpCode(f.secret, totpStep(NOW)),
      );
      expect(out).toMatchObject({
        kind: 'rejected',
        detail: 'mfa_invalid_code',
      });
    });

    it('Dado código de um passo já usado antes, Então rejeita sem tentar consumir', async () => {
      const admin = account('company_admin');
      const f = factor({ lastUsedStep: totpStep(NOW) });
      const { deps, repo, pending } = await pendingFor(admin, { factor: f });
      const out = await verifyMfaCode(
        deps,
        pending,
        totpCode(f.secret, totpStep(NOW)),
      );
      expect(out).toMatchObject({ kind: 'rejected' });
      expect(repo.claimStep).not.toHaveBeenCalled();
    });

    it('Dado que o fator sumiu, Então a verificação expirou', async () => {
      const admin = account('company_admin');
      const { deps, pending } = await pendingFor(admin, { factor: null });
      expect(await verifyMfaCode(deps, pending, '123456')).toEqual({
        kind: 'expired',
      });
    });
  });

  describe('Cenário: cadastro do autenticador (etapa confirm)', () => {
    const enroll = async (acc: UserAccount, setup: Setup = {}) => {
      const { deps, repo } = build({ ...setup, stored: acc });
      const begun = beginEnrollment(deps, { account: acc });
      const pending = await resolvePendingLogin(deps, begun.pendingToken, [
        'confirm',
      ]);
      if (!pending) throw new Error('pendente esperado');
      return { deps, repo, pending, secret: begun.secret, begun };
    };

    it('Dado o início do cadastro, Então devolve chave, link otpauth com o e-mail e token da etapa confirm com a chave cifrada', () => {
      const admin = account('company_admin');
      const { deps } = build();
      const begun = beginEnrollment(deps, { account: admin });
      expect(begun.otpauthUri).toContain('otpauth://totp/');
      expect(begun.otpauthUri).toContain(begun.secret);
      const token = verifyMfaPendingToken(AUTH_SECRET, begun.pendingToken, NOW);
      expect(token?.stage).toBe('confirm');
      expect(token?.encryptedSecret).toBeDefined();
      expect(token?.encryptedSecret).not.toContain(begun.secret);
      expect(deps.cipher.decrypt(token?.encryptedSecret ?? '')).toBe(
        begun.secret,
      );
    });

    it('Dado o código certo, Então grava o fator, devolve 10 códigos de recuperação e a sessão nova', async () => {
      const admin = account('company_admin');
      const { deps, repo, pending, secret } = await enroll(admin);
      const step = totpStep(NOW);
      const out = await verifyMfaCode(deps, pending, totpCode(secret, step));
      expect(out).toMatchObject({
        kind: 'session',
        detail: 'mfa_enrolled',
        sessionVersion: 4,
        account: admin,
      });
      const codes = (out as { recoveryCodes: string[] }).recoveryCodes;
      expect(codes).toHaveLength(10);
      const call = (
        repo.completeEnrollment.mock.calls as unknown[][]
      )[0]?.[0] as Record<string, unknown>;
      expect(call).toMatchObject({
        accountId: admin.id,
        secret,
        step,
        expectedSessionVersion: 3,
        now: new Date(NOW),
      });
      expect(call.recoveryCodeHashes).toHaveLength(10);
    });

    it('Dado código errado, Então rejeita e nada é gravado', async () => {
      const admin = account('company_admin');
      const { deps, repo, pending, secret } = await enroll(admin);
      const out = await verifyMfaCode(
        deps,
        pending,
        totpCode(secret, totpStep(NOW) + 10),
      );
      expect(out).toMatchObject({
        kind: 'rejected',
        message: INVALID_CODE_MESSAGE,
        detail: 'mfa_invalid_code',
      });
      expect(repo.completeEnrollment).not.toHaveBeenCalled();
    });

    it('Dado cadastro já consumido, Então expira', async () => {
      const admin = account('company_admin');
      const { deps, pending, secret } = await enroll(admin, {
        completeEnrollment: false,
      });
      expect(
        await verifyMfaCode(deps, pending, totpCode(secret, totpStep(NOW))),
      ).toEqual({ kind: 'expired' });
    });

    it('Dado token confirm sem chave, Então expira sem consultar o autenticador', async () => {
      const admin = account('company_admin');
      const { deps, repo } = build({ stored: admin });
      const pending = await resolvePendingLogin(
        deps,
        tokenFor(admin, 'confirm'),
        ['confirm'],
      );
      if (!pending) throw new Error('pendente esperado');
      expect(await verifyMfaCode(deps, pending, '123456')).toEqual({
        kind: 'expired',
      });
      expect(repo.findFactor).not.toHaveBeenCalled();
    });
  });

  describe('Cenário: código de recuperação', () => {
    const pendingFor = async (acc: UserAccount, setup: Setup) => {
      const { deps, repo } = build({ ...setup, stored: acc });
      const pending = await resolvePendingLogin(deps, tokenFor(acc, 'verify'), [
        'verify',
      ]);
      if (!pending) throw new Error('pendente esperado');
      return { deps, repo, pending };
    };

    it('Dado um código válido, Então consome e exige recadastrar o autenticador', async () => {
      const admin = account('company_admin');
      const record = {
        id: 'rec-1',
        codeHash: await hashRecoveryCode('ABCDE-12345'),
      };
      const { deps, repo, pending } = await pendingFor(admin, {
        recoveryRecords: [record],
      });
      const out = await redeemRecoveryCode(deps, pending, 'abcde-12345');
      expect(out).toMatchObject({
        kind: 'enroll',
        account: admin,
        detail: 'mfa_recovery_code_used',
      });
      expect(repo.claimRecoveryCode).toHaveBeenCalledWith(
        'rec-1',
        new Date(NOW),
      );
      const token = verifyMfaPendingToken(
        AUTH_SECRET,
        (out as { pendingToken: string }).pendingToken,
        NOW,
      );
      expect(token).toMatchObject({ stage: 'enroll', accountId: admin.id });
    });

    it('Dado código que não confere, Então rejeita sem consumir nada', async () => {
      const admin = account('company_admin');
      const record = {
        id: 'rec-1',
        codeHash: await hashRecoveryCode('ABCDE-12345'),
      };
      const { deps, repo, pending } = await pendingFor(admin, {
        recoveryRecords: [record],
      });
      expect(await redeemRecoveryCode(deps, pending, 'ZZZZZ-99999')).toEqual({
        kind: 'rejected',
        account: admin,
        message: INVALID_RECOVERY_CODE_MESSAGE,
        detail: 'mfa_invalid_recovery_code',
      });
      expect(repo.claimRecoveryCode).not.toHaveBeenCalled();
    });

    it('Dado código que outro acesso consumiu antes, Então rejeita', async () => {
      const admin = account('company_admin');
      const record = {
        id: 'rec-1',
        codeHash: await hashRecoveryCode('ABCDE-12345'),
      };
      const { deps, pending } = await pendingFor(admin, {
        recoveryRecords: [record],
        claimRecovery: false,
      });
      expect(
        await redeemRecoveryCode(deps, pending, 'ABCDE-12345'),
      ).toMatchObject({
        kind: 'rejected',
        detail: 'mfa_invalid_recovery_code',
      });
    });
  });
});
