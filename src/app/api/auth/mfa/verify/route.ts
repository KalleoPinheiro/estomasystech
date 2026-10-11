import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  MFA_BODY_MESSAGE,
  MFA_EXPIRED_MESSAGE,
  type MfaOutcome,
  redeemRecoveryCode,
  resolvePendingLogin,
  verifyMfaCode,
} from '@/application/auth/mfa-login';
import type { UserAccount } from '@/domain/auth/user-account';
import { fail, ok } from '@/lib/api-response';
import { mfaContext, sessionResponse } from '@/lib/auth/mfa-route';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { getAuthConfig } from '@/lib/auth/session';

/** Por conta, não por IP: vale entre tokens pendentes e entre réplicas. */
const MFA_RATE_LIMIT = new SharedRateLimiter('mfa-verify', 5, 60_000);

const schema = z.object({
  pendingToken: z.string().max(8192).optional(),
  code: z.string().max(16).optional(),
  recoveryCode: z.string().max(64).optional(),
});

type Body = z.infer<typeof schema>;

function isWellFormed({ code, recoveryCode }: Body): boolean {
  if ((code === undefined) === (recoveryCode === undefined)) return false;
  return code === undefined || /^\d{6}$/.test(code);
}

async function respond(
  outcome: MfaOutcome,
  authSecret: string,
  audit: (account: UserAccount, detail: string) => Promise<void>,
) {
  if (outcome.kind === 'expired') {
    return fail(MFA_EXPIRED_MESSAGE, 401);
  }
  await audit(outcome.account, outcome.detail);
  if (outcome.kind === 'rejected') {
    return fail(outcome.message, 401);
  }
  if (outcome.kind === 'enroll') {
    return ok({
      mfaEnrollmentRequired: true,
      pendingToken: outcome.pendingToken,
    });
  }
  return sessionResponse(
    authSecret,
    outcome.account,
    outcome.sessionVersion,
    outcome.recoveryCodes
      ? { recoveryCodes: outcome.recoveryCodes }
      : { ok: true },
  );
}

/**
 * Segunda etapa do login com segundo fator (ADR-008, ADR-012): código do
 * autenticador (entra, ou confirma o cadastro e recebe os 10 códigos de
 * recuperação uma única vez) ou código de recuperação (leva ao recadastro).
 */
export async function POST(request: NextRequest) {
  const auth = getAuthConfig();
  if (!auth) {
    return fail('Autenticação não configurada no servidor', 503);
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isWellFormed(parsed.data)) {
    return fail(MFA_BODY_MESSAGE, 400);
  }
  const { code, recoveryCode, pendingToken } = parsed.data;
  const { deps, audit } = await mfaContext(auth.secret);
  const pending = await resolvePendingLogin(
    deps,
    pendingToken,
    recoveryCode === undefined ? ['verify', 'confirm'] : ['verify'],
  );
  if (!pending) {
    return fail(MFA_EXPIRED_MESSAGE, 401);
  }
  if (!(await MFA_RATE_LIMIT.allow(pending.account.id))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }
  const outcome =
    recoveryCode === undefined
      ? await verifyMfaCode(deps, pending, code as string)
      : await redeemRecoveryCode(deps, pending, recoveryCode);
  return respond(outcome, auth.secret, audit);
}
