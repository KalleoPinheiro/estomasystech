import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { PrescribeOutcome } from '@/application/clinical/prescribe-outcome';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanOutcomeDto } from '@/lib/dto';

const outcomeSchema = z
  .object({
    outcomeCode: z.string().min(1).max(20),
    baselineScore: z.number().int().min(1).max(5),
    targetScore: z.number().int().min(1).max(5),
    deadline: z.iso.datetime().nullish(),
  })
  .refine((body) => body.targetScore > body.baselineScore, {
    error: 'Meta deve ser maior que a pontuação basal',
    path: ['targetScore'],
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
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
    const body = outcomeSchema.parse(await request.json());
    const { carePlanOutcomes, carePlans, nursingOutcomes, auditEvents } = repos;
    const outcome = await new PrescribeOutcome(
      carePlanOutcomes,
      carePlans,
      nursingOutcomes,
    ).execute({
      carePlanId: id,
      outcomeCode: body.outcomeCode,
      baselineScore: body.baselineScore,
      targetScore: body.targetScore,
      deadline: body.deadline ? new Date(body.deadline) : null,
    });
    const [plan, catalogEntry] = await Promise.all([
      carePlans.findById(id),
      nursingOutcomes.findByCode(body.outcomeCode),
    ]);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'care_plan_outcome',
      resourceId: outcome.id,
      patientId: plan?.patientId ?? null,
    });
    return toCarePlanOutcomeDto(outcome, [], catalogEntry);
  });
}
