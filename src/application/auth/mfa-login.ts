import { type MfaRepository, mfaPolicy } from '@/domain/auth/mfa';
import { generateTotpSecret, otpauthUri, verifyTotp } from '@/domain/auth/totp';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import {
  createMfaPendingToken,
  type MfaPendingToken,
  type MfaStage,
  verifyMfaPendingToken,
} from '@/lib/auth/mfa-pending-token';
import {
  findMatchingRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '@/lib/auth/mfa-recovery-codes';
import type { FieldCipher } from '@/lib/data-cipher';

/**
 * Login em duas etapas (ADR-008, ADR-012). Para quem precisa do segundo fator
 * a senha só rende um token pendente; a sessão nasce depois do código do
 * autenticador, ou depois de cadastrar um autenticador quando a conta ainda não
 * tem e o papel o exige (primeiro acesso, ou recadastro após usar um código de
 * recuperação).
 */
export const MFA_EXPIRED_MESSAGE =
  'Verificação expirada. Entre novamente com e-mail e senha.';
export const INVALID_CODE_MESSAGE = 'Código inválido';
export const INVALID_RECOVERY_CODE_MESSAGE = 'Código de recuperação inválido';
export const MFA_BODY_MESSAGE =
  'Informe o código de 6 dígitos ou um código de recuperação';

export interface MfaDeps {
  userAccounts: UserAccountRepository;
  mfa: MfaRepository;
  cipher: FieldCipher;
  authSecret: string;
  nowMs: number;
}

export interface PendingLogin {
  token: MfaPendingToken;
  account: UserAccount;
}

export type MfaOutcome =
  | {
      kind: 'session';
      account: UserAccount;
      sessionVersion: number;
      detail: 'mfa_verified' | 'mfa_enrolled';
      recoveryCodes?: string[];
    }
  | {
      kind: 'enroll';
      account: UserAccount;
      pendingToken: string;
      detail: 'mfa_recovery_code_used';
    }
  | {
      kind: 'rejected';
      account: UserAccount;
      message: string;
      detail: 'mfa_invalid_code' | 'mfa_invalid_recovery_code';
    }
  | { kind: 'expired' };

const pendingToken = (
  deps: MfaDeps,
  account: UserAccount,
  stage: MfaStage,
  encryptedSecret?: string,
): string =>
  createMfaPendingToken(
    deps.authSecret,
    {
      accountId: account.id,
      sessionVersion: account.sessionVersion,
      stage,
      encryptedSecret,
    },
    deps.nowMs,
  );

export type PendingLoginResponse =
  | { mfaRequired: true; pendingToken: string }
  | { mfaEnrollmentRequired: true; pendingToken: string };

/**
 * Resposta do login por senha quando falta o segundo fator; `null` quando a
 * senha basta (papel sem 2FA, ou 2FA opcional ainda não cadastrado).
 */
export async function startMfaLogin(
  deps: MfaDeps,
  account: UserAccount,
): Promise<PendingLoginResponse | null> {
  const policy = mfaPolicy(account.role);
  if (policy === 'none') return null;
  const factor = await deps.mfa.findFactor(account.id);
  if (factor) {
    return {
      mfaRequired: true,
      pendingToken: pendingToken(deps, account, 'verify'),
    };
  }
  return policy === 'required'
    ? {
        mfaEnrollmentRequired: true,
        pendingToken: pendingToken(deps, account, 'enroll'),
      }
    : null;
}

/**
 * Token válido, da etapa esperada, de conta ativa com papel de segundo fator
 * cuja `session_version` ainda é a do token — senão `null` (401 único).
 */
export async function resolvePendingLogin(
  deps: MfaDeps,
  value: string | undefined,
  stages: readonly MfaStage[],
): Promise<PendingLogin | null> {
  const token = verifyMfaPendingToken(deps.authSecret, value, deps.nowMs);
  if (!token || !stages.includes(token.stage)) return null;
  const account = await deps.userAccounts.findById(token.accountId);
  const usable =
    account?.isActive === true &&
    mfaPolicy(account.role) !== 'none' &&
    account.sessionVersion === token.sessionVersion;
  return usable ? { token, account } : null;
}

/** Gera a chave nova; ela só vai ao banco quando a confirmação acertar o código. */
export function beginEnrollment(
  deps: MfaDeps,
  { account }: Pick<PendingLogin, 'account'>,
): { secret: string; otpauthUri: string; pendingToken: string } {
  const secret = generateTotpSecret();
  return {
    secret,
    otpauthUri: otpauthUri(secret, account.email),
    pendingToken: pendingToken(
      deps,
      account,
      'confirm',
      deps.cipher.encrypt(secret),
    ),
  };
}

const rejectedCode = (account: UserAccount): MfaOutcome => ({
  kind: 'rejected',
  account,
  message: INVALID_CODE_MESSAGE,
  detail: 'mfa_invalid_code',
});

async function verifyFactorCode(
  deps: MfaDeps,
  { account }: PendingLogin,
  code: string,
): Promise<MfaOutcome> {
  const factor = await deps.mfa.findFactor(account.id);
  if (!factor) return { kind: 'expired' };
  const step = verifyTotp(factor.secret, code, deps.nowMs, factor.lastUsedStep);
  if (step === null || !(await deps.mfa.claimStep(account.id, step))) {
    return rejectedCode(account);
  }
  return {
    kind: 'session',
    account,
    sessionVersion: account.sessionVersion,
    detail: 'mfa_verified',
  };
}

async function confirmEnrollment(
  deps: MfaDeps,
  { account, token }: PendingLogin,
  code: string,
): Promise<MfaOutcome> {
  if (!token.encryptedSecret) return { kind: 'expired' };
  const secret = deps.cipher.decrypt(token.encryptedSecret);
  const step = verifyTotp(secret, code, deps.nowMs);
  if (step === null) return rejectedCode(account);
  const recoveryCodes = generateRecoveryCodes();
  const completed = await deps.mfa.completeEnrollment({
    accountId: account.id,
    secret,
    step,
    recoveryCodeHashes: await Promise.all(recoveryCodes.map(hashRecoveryCode)),
    expectedSessionVersion: token.sessionVersion,
    now: new Date(deps.nowMs),
  });
  if (!completed) return { kind: 'expired' };
  return {
    kind: 'session',
    account,
    sessionVersion: token.sessionVersion + 1,
    detail: 'mfa_enrolled',
    recoveryCodes,
  };
}

/** Código do autenticador: confirma o cadastro (etapa `confirm`) ou entra (`verify`). */
export function verifyMfaCode(
  deps: MfaDeps,
  pending: PendingLogin,
  code: string,
): Promise<MfaOutcome> {
  return pending.token.stage === 'confirm'
    ? confirmEnrollment(deps, pending, code)
    : verifyFactorCode(deps, pending, code);
}

/**
 * Código de recuperação: consome um código e exige recadastrar o autenticador
 * antes da sessão (decisão do dono, 2026-09-27). O fator antigo vale até lá.
 */
export async function redeemRecoveryCode(
  deps: MfaDeps,
  { account }: PendingLogin,
  input: string,
): Promise<MfaOutcome> {
  const records = await deps.mfa.listUnusedRecoveryCodes(account.id);
  const match = await findMatchingRecoveryCode(input, records);
  const claimed =
    match !== null &&
    (await deps.mfa.claimRecoveryCode(match.id, new Date(deps.nowMs)));
  if (!claimed) {
    return {
      kind: 'rejected',
      account,
      message: INVALID_RECOVERY_CODE_MESSAGE,
      detail: 'mfa_invalid_recovery_code',
    };
  }
  return {
    kind: 'enroll',
    account,
    pendingToken: pendingToken(deps, account, 'enroll'),
    detail: 'mfa_recovery_code_used',
  };
}
