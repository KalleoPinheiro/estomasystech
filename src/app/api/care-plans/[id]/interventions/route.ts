import type { NextRequest } from 'next/server';
import { PrescribeIntervention } from '@/application/clinical/prescribe-intervention';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanInterventionDto } from '@/lib/dto';
import { interventionSchema } from '@/lib/patient-record-schemas';

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
    const body = interventionSchema.parse(await request.json());
    const {
      carePlanInterventions,
      carePlans,
      nursingInterventions,
      auditEvents,
    } = repos;
    const intervention = await new PrescribeIntervention(
      carePlanInterventions,
      carePlans,
      nursingInterventions,
    ).execute({
      carePlanId: id,
      interventionCode: body.interventionCode,
      frequency: body.frequency,
      priority: body.priority,
    });
    const [plan, catalogEntry] = await Promise.all([
      carePlans.findById(id),
      nursingInterventions.findByCode(body.interventionCode),
    ]);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'care_plan_intervention',
      resourceId: intervention.id,
      patientId: plan?.patientId ?? null,
    });
    return toCarePlanInterventionDto(
      intervention,
      [],
      catalogEntry?.label ?? intervention.interventionCode,
    );
  });
}
