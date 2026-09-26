import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  accountChangeDetail,
  assertCanDeactivate,
  assertCanManageAccount,
} from '@/domain/auth/account-management';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { accountManager } from '@/lib/auth/account-manager';
import { hashPassword } from '@/lib/auth/password';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toUserAccountDto } from '@/lib/dto';

const updateSchema = z.object({
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updateSchema.parse(await request.json());
    const { userAccounts, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );

    const all = await userAccounts.findAll();
    const existing = all.find((account) => account.id === id);
    if (!existing) {
      throw new NotFoundError('Conta', id);
    }
    const actor = accountManager(guard.session);
    assertCanManageAccount(actor, existing);
    if (body.active === false) assertCanDeactivate(actor, existing, all);

    let updated = existing;
    if (body.password) {
      updated = updated.withPasswordHash(await hashPassword(body.password));
    }
    if (body.active === true) updated = updated.reactivate();
    if (body.active === false) updated = updated.deactivate();

    const detail = accountChangeDetail(body);
    if (detail) {
      // Write-ahead (#184): senha e ativação são tomada de conta em potencial;
      // sem trilha, a alteração não acontece.
      await recordAuditNow(auditEvents, guard.session, {
        action: 'update',
        resourceType: 'account',
        resourceId: id,
        detail,
      });
    }
    await userAccounts.save(updated);
    return toUserAccountDto(updated);
  });
}
