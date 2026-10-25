import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { SetFollowUpStatus } from '@/application/followups/set-follow-up-status';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toFollowUpDto } from '@/lib/dto';
import {
  authorizeFollowUpResolution,
  followUpResolutionAudit,
  toFollowUpResolution,
} from '@/lib/server/follow-up-resolution';

const patchSchema = z.object({ status: z.enum(['done', 'cancelled']) });

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Concluir ou cancelar um retorno. R4 e escopo de empresa vêm da mesma regra da
 * tela Hoje (#597); a gravação e a trilha de auditoria saem na mesma transação
 * (ADR-075).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const scope = writeScope(guard.session);
    await authorizeFollowUpResolution(guard.session, scope, id);
    const { transactions } = await getRepositories(scope);
    return transactions.run(async (tx) => {
      const updated = await new SetFollowUpStatus(tx.followUps).execute({
        id,
        status: body.status,
      });
      await recordAuditNow(
        tx.auditEvents,
        guard.session,
        followUpResolutionAudit(toFollowUpResolution(updated)),
      );
      return toFollowUpDto(updated);
    });
  });
}
