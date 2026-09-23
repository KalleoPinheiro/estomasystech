import type { NextRequest } from 'next/server';
import { IssueAuthToken } from '@/application/auth/auth-token-flow';
import { appUrlFromEnv } from '@/application/auth/send-invite';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Reemite o link de acesso de uma conta existente — usado quando o convite
 * original não chegou (issue #52). Propósito segue o estado da conta: `invite`
 * enquanto ninguém definiu senha ainda, `reset` depois disso (mesmo link, texto
 * diferente — ver `IssueAuthToken`).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { userAccounts, authTokens, email } = await getRepositories(
      writeScope(guard.session),
    );

    const all = await userAccounts.findAll();
    const account = all.find((existing) => existing.id === id);
    if (!account) {
      throw new NotFoundError('Conta', id);
    }
    if (!account.isActive) {
      throw new ValidationError('Conta desativada não pode receber convite');
    }

    const purpose =
      account.passwordHash === UNSET_PASSWORD_HASH ? 'invite' : 'reset';
    const { delivered } = await new IssueAuthToken(
      authTokens,
      email,
    ).issueAndTryDeliver({
      account,
      purpose,
      appUrl: appUrlFromEnv(),
    });

    return { delivered };
  });
}
