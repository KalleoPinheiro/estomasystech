import type { NextRequest } from 'next/server';
import { z } from 'zod';
import type { TransactionManager } from '@/application/ports/transaction-manager';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import {
  type AccountManager,
  accountChangeDetail,
  assertCanDeactivate,
  assertCanManageAccount,
} from '@/domain/auth/account-management';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { accountManager } from '@/lib/auth/account-manager';
import { requireStaffSession } from '@/lib/auth/require-session';
import type { Session } from '@/lib/auth/session';
import { forgetSessionStatus } from '@/lib/auth/staff-revocation';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toUserAccountDto } from '@/lib/dto';

// `strict`: o admin não define a senha de outra conta (#295). `password` no
// corpo é `400`; o caminho é o link de redefinição (C2, #265) e, para a
// própria senha, "Minha conta".
const updateSchema = z.object({ active: z.boolean().optional() }).strict();
type UpdateBody = z.infer<typeof updateSchema>;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());
    const { userAccounts, auditEvents, transactions } = await getRepositories(
      writeScope(guard.session),
    );

    const existing = await userAccounts.findById(id);
    if (!existing) {
      throw new NotFoundError('Conta', id);
    }
    const actor = accountManager(guard.session);
    assertCanManageAccount(actor, existing);

    const updated =
      body.active === false
        ? await deactivate(transactions, actor, existing, body, guard.session)
        : await applyChange(
            userAccounts,
            auditEvents,
            existing,
            body,
            guard.session,
          );

    if (body.active === false) {
      forgetSessionStatus(updated.email, updated.clinicId);
    }
    return toUserAccountDto(updated);
  });
}

/**
 * Desativar é a única mudança que depende do estado de outras contas (regra
 * do último `company_admin` ativo, #244): tranca as linhas `company_admin`
 * da empresa (`SELECT ... FOR UPDATE`) e reavalia a regra dentro da mesma
 * transação que grava a mudança — duas desativações concorrentes de admins
 * diferentes nunca passam as duas (a segunda recebe `409`).
 */
async function deactivate(
  transactions: TransactionManager,
  actor: AccountManager,
  existing: UserAccount,
  body: UpdateBody,
  session: Session,
): Promise<UserAccount> {
  return transactions.run(async ({ userAccounts, auditEvents }) => {
    const clinicAdmins =
      await userAccounts.findByRoleForUpdate('company_admin');
    assertCanDeactivate(actor, existing, clinicAdmins);

    const updated = existing.deactivate();

    const detail = accountChangeDetail(body);
    if (detail) {
      // Write-ahead (#184): se a trilha falha, a transação desfaz tudo.
      await recordAuditNow(auditEvents, session, {
        action: 'update',
        resourceType: 'account',
        resourceId: existing.id,
        detail,
      });
    }
    await userAccounts.save(updated);
    // Conta desativada derruba as sessões existentes (#194).
    await userAccounts.revokeSessions(updated.id);
    return updated;
  });
}

/** Reativação não depende do estado de outras contas. */
async function applyChange(
  userAccounts: UserAccountRepository,
  auditEvents: AuditEventRepository,
  existing: UserAccount,
  body: UpdateBody,
  session: Session,
): Promise<UserAccount> {
  const updated = body.active === true ? existing.reactivate() : existing;

  const detail = accountChangeDetail(body);
  if (detail) {
    // Write-ahead (#184): sem trilha, a alteração não acontece.
    await recordAuditNow(auditEvents, session, {
      action: 'update',
      resourceType: 'account',
      resourceId: existing.id,
      detail,
    });
  }
  await userAccounts.save(updated);
  return updated;
}
