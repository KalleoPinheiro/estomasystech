import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { assertCurrentPassword } from '@/application/auth/change-own-password';
import { beginEnrollment } from '@/application/auth/mfa-login';
import { mfaPolicy } from '@/domain/auth/mfa';
import { ConflictError, ValidationError } from '@/domain/shared/errors';
import { fail, handleRequest } from '@/lib/api-response';
import { mfaContext } from '@/lib/auth/mfa-route';
import { requireOwnAccount } from '@/lib/auth/own-account';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';

const RATE_LIMIT = new SharedRateLimiter('own-account-mfa', 5, 60_000);

const bodySchema = z
  .object({ currentPassword: z.string().min(1).max(200) })
  .strict();

/**
 * Liga o segundo fator opcional de quem está logado (#295): confere a senha
 * atual e devolve a chave em texto, o link `otpauth://` e o token de
 * confirmação. Nada é gravado aqui; o código é confirmado em
 * `POST /api/me/mfa/confirm`, que grava o fator, devolve os 10 códigos de
 * recuperação e derruba as outras sessões (ACE-RN-19).
 */
export async function POST(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;
  if (!(await RATE_LIMIT.allow(own.account.id))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }

  return handleRequest(async () => {
    const { account, services, authSecret } = own;
    const body = bodySchema.parse(await request.json().catch(() => null));
    if (mfaPolicy(account.role) === 'none') {
      throw new ValidationError('Este papel não usa segundo fator');
    }
    if (await services.mfa.findFactor(account.id)) {
      throw new ConflictError('O segundo fator já está ativo');
    }
    await assertCurrentPassword(account, body.currentPassword);
    const { deps } = await mfaContext(authSecret);
    return beginEnrollment(deps, { account });
  });
}
