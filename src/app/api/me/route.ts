import type { NextRequest } from 'next/server';
import { mfaPolicy } from '@/domain/auth/mfa';
import { handleRequest } from '@/lib/api-response';
import { requireOwnAccount } from '@/lib/auth/own-account';

/** Dados de "Minha conta" (#295): e-mail, papel e situação do segundo fator. */
export async function GET(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;

  return handleRequest(async () => {
    const { account, services } = own;
    const factor = await services.mfa.findFactor(account.id);
    return {
      email: account.email,
      role: account.role,
      mfa: { policy: mfaPolicy(account.role), enrolled: factor !== null },
    };
  });
}
