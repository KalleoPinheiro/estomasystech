import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  resolvePendingLogin,
  verifyMfaCode,
} from '@/application/auth/mfa-login';
import { fail, ok } from '@/lib/api-response';
import { mfaContext } from '@/lib/auth/mfa-route';
import { requireOwnAccount, withRenewedSession } from '@/lib/auth/own-account';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';

const RATE_LIMIT = new SharedRateLimiter('own-account-mfa-confirm', 5, 60_000);

export const ENROLLMENT_EXPIRED_MESSAGE =
  'O cadastro expirou. Comece de novo para gerar outra chave.';

const bodySchema = z
  .object({
    pendingToken: z.string().min(1).max(8192),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

/**
 * Confirma o código do autenticador e grava o fator (#295, ACE-RN-53). Como
 * `POST /api/auth/mfa/verify` no login, devolve os 10 códigos de recuperação
 * uma única vez e derruba as outras sessões; o cookie desta é renovado. Código
 * errado é `400` (e não `401`): a sessão está viva, e o `401` mandaria a tela
 * ao login.
 */
export async function POST(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;
  if (!(await RATE_LIMIT.allow(own.account.id))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('Informe o código de 6 dígitos', 400);
  }

  const { deps, audit } = await mfaContext(own.authSecret);
  const pending = await resolvePendingLogin(deps, parsed.data.pendingToken, [
    'confirm',
  ]);
  // O token é da conta que o pediu; nenhuma outra sessão o consome.
  if (!pending || pending.account.id !== own.account.id) {
    return fail(ENROLLMENT_EXPIRED_MESSAGE, 400);
  }
  const outcome = await verifyMfaCode(deps, pending, parsed.data.code);
  if (outcome.kind === 'expired') {
    return fail(ENROLLMENT_EXPIRED_MESSAGE, 400);
  }
  await audit(outcome.account, outcome.detail);
  if (outcome.kind !== 'session') {
    return fail(
      outcome.kind === 'rejected' ? outcome.message : 'Código inválido',
      400,
    );
  }
  // Sem isto o cookie anterior ainda passaria até 60 s pelo cache do proxy.
  forgetSessionStatus(own.account.email, own.account.clinicId);

  return withRenewedSession(
    ok({ recoveryCodes: outcome.recoveryCodes ?? [] }),
    own.authSecret,
    outcome.account,
    outcome.sessionVersion,
  );
}
