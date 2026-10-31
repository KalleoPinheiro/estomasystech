import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ResolveCarePlan } from '@/application/clinical/resolve-care-plan';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanDto } from '@/lib/dto';
import { getCarePlanDetailFor } from '@/lib/server/data/care-plan';

const actionSchema = z.object({ action: z.literal('resolve') });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    getCarePlanDetailFor(guard.session, (await context.params).id),
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlan',
      id,
      repos,
    );
    actionSchema.parse(await request.json());
    const { carePlans, auditEvents } = repos;
    const plan = await new ResolveCarePlan(carePlans).execute({ id });
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'care_plan',
      resourceId: plan.id,
      patientId: plan.patientId,
      detail: 'resolvido',
    });
    return toCarePlanDto(plan);
  });
}
