import type { NextRequest } from 'next/server';
import { issueAccessLink } from '@/application/auth/send-invite';
import {
  assertCanManageAccount,
  DEACTIVATED_ACCOUNT_MESSAGE,
} from '@/domain/auth/account-management';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { accountManager } from '@/lib/auth/account-manager';
import { SharedRateLimiter } from '@/lib/auth/rate-limit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeClinicId, writeScope } from '@/lib/auth/tenant-scope';

/** Por conta de quem gera: o link é uma credencial, não pode ser martelado. */
const RESET_LINK_RATE_LIMIT = new SharedRateLimiter('reset-link', 5, 60_000);

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Link de redefinição de senha gerado pelo Admin de Empresa (C2, #265): é o
 * caminho de quem esqueceu a senha numa clínica sem canal de e-mail. Emite um
 * token `reset` de 1 h, que invalida os anteriores não usados, e tenta enviá-lo
 * pelo canal da clínica; quando não sai, o link volta para o admin repassar.
 * A família da rota já é `administrative`; o handler confere de novo (ADR-002).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const actor = accountManager(guard.session);
  if (actor.role !== 'company_admin') {
    return fail('Só o Admin de Empresa gera link de redefinição', 403);
  }
  const caller = `${writeClinicId(guard.session)}:${actor.subject ?? 'open'}`;
  if (!(await RESET_LINK_RATE_LIMIT.allow(caller))) {
    return fail('Muitas tentativas, aguarde um minuto', 429);
  }

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(writeScope(guard.session));
    // Escopado à clínica da sessão: conta de outra clínica não é encontrada.
    const account = await services.userAccounts.findById(id);
    if (!account) {
      throw new NotFoundError('Conta', id);
    }
    assertCanManageAccount(actor, account);
    if (!account.isActive) {
      throw new ConflictError(DEACTIVATED_ACCOUNT_MESSAGE);
    }

    // Write-ahead (#184): sem trilha, o link não é emitido. Nunca o link nem
    // o segredo na trilha.
    await recordAuditNow(services.auditEvents, guard.session, {
      action: 'update',
      resourceType: 'account',
      resourceId: account.id,
      detail: 'reset-link',
    });
    return issueAccessLink(services, account, 'reset');
  });
}
