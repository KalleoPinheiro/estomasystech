import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { changeOwnPassword } from '@/application/auth/change-own-password';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireOwnAccount, withRenewedSession } from '@/lib/auth/own-account';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';

/** Por conta: a senha atual é adivinhável por quem roubou uma sessão. */
export const OWN_ACCOUNT_RATE_LIMIT = new SharedRateLimiter(
  'own-account',
  5,
  60_000,
);

const bodySchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(1).max(200),
  })
  .strict();

/**
 * "Minha conta": a pessoa troca a própria senha informando a atual (#295). A
 * troca derruba as outras sessões (ACE-RN-08) e renova o cookie desta.
 * Senha atual errada → `400`; política de senha como em ACE-RN-41.
 */
export async function POST(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;
  if (!(await OWN_ACCOUNT_RATE_LIMIT.allow(own.account.id))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }

  let sessionVersion: number | null = null;
  const response = await handleRequest(async () => {
    const body = bodySchema.parse(await request.json().catch(() => null));
    const { account, session, services } = own;
    sessionVersion = await changeOwnPassword(
      services.userAccounts,
      account,
      body,
      () =>
        recordAuditNow(services.auditEvents, session, {
          action: 'update',
          resourceType: 'account',
          resourceId: account.id,
          detail: 'password-change',
        }),
    );
    forgetSessionStatus(account.email, account.clinicId);
    return { ok: true };
  });
  return sessionVersion === null
    ? response
    : withRenewedSession(response, own.authSecret, own.account, sessionVersion);
}
