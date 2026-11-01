import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { GetCarePlan } from '@/application/clinical/get-care-plan';
import { ResolveCarePlan } from '@/application/clinical/resolve-care-plan';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanDetailDto, toCarePlanDto } from '@/lib/dto';

const actionSchema = z.object({ action: z.literal('resolve') });

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(sessionScope(guard.session));
    await assertClinicalResourceAccessible(
      guard.session,
      'carePlan',
      id,
      repos,
    );
    const {
      carePlans,
      carePlanDiagnoses,
      carePlanOutcomes,
      carePlanInterventions,
      outcomeEvaluations,
      interventionRecords,
      nursingDiagnoses,
      nursingOutcomes,
      nursingInterventions,
      auditEvents,
    } = repos;
    const detail = await new GetCarePlan(
      carePlans,
      carePlanDiagnoses,
      carePlanOutcomes,
      carePlanInterventions,
      outcomeEvaluations,
      interventionRecords,
    ).execute({ id });

    const [diagnosisCatalog, outcomeCatalog, interventionCatalog] =
      await Promise.all([
        nursingDiagnoses.findByCodes(
          detail.diagnoses.map((d) => d.diagnosisCode),
        ),
        nursingOutcomes.findByCodes(
          detail.outcomes.map(({ outcome }) => outcome.outcomeCode),
        ),
        nursingInterventions.findByCodes(
          detail.interventions.map(
            ({ intervention }) => intervention.interventionCode,
          ),
        ),
      ]);

    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'care_plan',
      resourceId: id,
      patientId: detail.plan.patientId,
    });
    return toCarePlanDetailDto(detail, {
      diagnoses: new Map(diagnosisCatalog.map((d) => [d.code, d])),
      outcomes: new Map(outcomeCatalog.map((o) => [o.code, o])),
      interventions: new Map(interventionCatalog.map((i) => [i.code, i])),
    });
  });
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
