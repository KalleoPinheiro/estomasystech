import type { NextRequest } from 'next/server';
import { resetAccountMfa } from '@/application/auth/reset-account-mfa';
import { assertCanManageAccount } from '@/domain/auth/account-management';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { accountManager } from '@/lib/auth/account-manager';
import { requireStaffSession } from '@/lib/auth/require-session';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * O Admin de Empresa remove o segundo fator de quem perdeu o celular (#295).
 * Só contas da própria clínica dentro da matriz do ACE-RN-05, nunca a própria; a ação é
 * auditada antes de mudar, derruba as sessões da conta e apaga fator e códigos
 * de recuperação. A família da rota já é `administrative`; o handler confere de
 * novo (ADR-002).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const actor = accountManager(guard.session);
  if (actor.role !== 'company_admin') {
    return fail('Só o Admin de Empresa redefine o segundo fator', 403);
  }

  return handleRequest(async () => {
    const { id } = await context.params;
    const { userAccounts, auditEvents, mfa } = await getRepositories(
      writeScope(guard.session),
    );
    // Escopado à clínica da sessão: conta de outra clínica não é encontrada.
    const account = await userAccounts.findById(id);
    if (!account) {
      throw new NotFoundError('Conta', id);
    }
    assertCanManageAccount(actor, account);
    if (actor.subject !== null && account.email === actor.subject) {
      throw new ValidationError(
        'Não é possível redefinir o próprio segundo fator',
      );
    }

    await resetAccountMfa({ userAccounts, mfa }, account, () =>
      recordAuditNow(auditEvents, guard.session, {
        action: 'update',
        resourceType: 'account',
        resourceId: account.id,
        detail: 'reset-mfa',
      }),
    );
    forgetSessionStatus(account.email, account.clinicId);
    return { id: account.id, mfaReset: true };
  });
}
