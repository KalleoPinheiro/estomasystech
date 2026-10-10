import type { NextRequest } from 'next/server';
import { issueAccessLink } from '@/application/auth/send-invite';
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
    const services = await getRepositories(writeScope(guard.session));
    const { userAccounts, auditEvents } = services;

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
    // Sem canal ou com o canal falhando, o link volta para o admin (C2, #265).
    return issueAccessLink(services, account, purpose);
  });
}
