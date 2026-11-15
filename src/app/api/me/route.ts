import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireOwnAccount } from '@/lib/auth/own-account';
import { ownAccountView } from '@/lib/server/data/settings';

/** Dados de "Minha conta" (#295): e-mail, papel e situação do segundo fator. */
export async function GET(request: NextRequest) {
  const own = await requireOwnAccount(request);
  if (!own.ok) return own.response;

  return handleRequest(() => ownAccountView(own.account, own.services));
}
