import type { NextRequest } from 'next/server';
import { IssueAuthToken } from '@/application/auth/auth-token-flow';
import { appUrlFromEnv } from '@/application/auth/send-invite';
import { assertCanManageAccount } from '@/domain/auth/account-management';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { accountManager } from '@/lib/auth/account-manager';
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
    const { userAccounts, authTokens, email, auditEvents } =
      await getRepositories(writeScope(guard.session));

    const all = await userAccounts.findAll();
    const account = all.find((existing) => existing.id === id);
    if (!account) {
      throw new NotFoundError('Conta', id);
    }
    // Reemitir invalida o link anterior: mesma hierarquia do PATCH (#184).
    assertCanManageAccount(accountManager(guard.session), account);
    if (!account.isActive) {
      throw new ValidationError('Conta desativada não pode receber convite');
    }

    const purpose =
      account.passwordHash === UNSET_PASSWORD_HASH ? 'invite' : 'reset';
    await recordAuditNow(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'account',
      resourceId: id,
      detail: 'resend-invite',
    });
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
