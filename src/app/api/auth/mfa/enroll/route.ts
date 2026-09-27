import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  beginEnrollment,
  MFA_EXPIRED_MESSAGE,
  resolvePendingLogin,
} from '@/application/auth/mfa-login';
import { fail, ok } from '@/lib/api-response';
import { mfaContext } from '@/lib/auth/mfa-route';
import { getAuthConfig } from '@/lib/auth/session';

const schema = z.object({ pendingToken: z.string().min(1).max(8192) });

/**
 * Cadastro do autenticador do super_admin (ADR-007, bloco B2): devolve a chave
 * em texto e o link `otpauth://` (sem QR, Open 3). Nada é gravado aqui — a
 * chave viaja cifrada no token de confirmação até `POST /api/auth/mfa/verify`.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthConfig();
  if (!auth) {
    return fail('Autenticação não configurada no servidor', 503);
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(MFA_EXPIRED_MESSAGE, 401);
  }
  const { deps } = await mfaContext(auth.secret);
  const pending = await resolvePendingLogin(deps, parsed.data.pendingToken, [
    'enroll',
  ]);
  if (!pending) {
    return fail(MFA_EXPIRED_MESSAGE, 401);
  }
  return ok(beginEnrollment(deps, pending));
}
