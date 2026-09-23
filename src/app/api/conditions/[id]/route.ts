import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ResolveCondition } from '@/application/clinical/resolve-condition';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toConditionDto } from '@/lib/dto';

const actionSchema = z.object({ action: z.literal('resolve') });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { conditions, auditEvents } = await getRepositories(
      sessionScope(guard.session),
    );
    const condition = await conditions.findById(id);
    if (!condition) {
      return null;
    }
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'condition',
      resourceId: condition.id,
      patientId: condition.patientId,
    });
    return toConditionDto(condition);
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    actionSchema.parse(await request.json());
    const { conditions, auditEvents } = await getRepositories(
      writeScope(guard.session),
    );
    const condition = await new ResolveCondition(conditions).execute({ id });
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'condition',
      resourceId: condition.id,
      patientId: condition.patientId,
      detail: 'resolvida',
    });
    return toConditionDto(condition);
  });
}
