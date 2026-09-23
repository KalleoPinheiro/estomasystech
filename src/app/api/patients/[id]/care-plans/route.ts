import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ListCarePlansByPatient } from '@/application/clinical/list-care-plans-by-patient';
import { OpenCarePlan } from '@/application/clinical/open-care-plan';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanDto } from '@/lib/dto';

const openCarePlanSchema = z.object({
  conditionId: z.string().min(1).nullish(),
  professionalId: z.string().min(1).nullish(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { carePlans, auditEvents, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const result = await new ListCarePlansByPatient(carePlans).execute({
      patientId: id,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'care_plans',
      resourceId: id,
      patientId: id,
    });
    return result.map(toCarePlanDto);
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = openCarePlanSchema.parse(await request.json());
    const {
      carePlans,
      patients,
      conditions,
      auditEvents,
      professionalPatientLinks,
    } = await getRepositories(writeScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const plan = await new OpenCarePlan(
      carePlans,
      patients,
      conditions,
    ).execute({
      patientId: id,
      conditionId: body.conditionId ?? null,
      professionalId: body.professionalId ?? null,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'care_plan',
      resourceId: plan.id,
      patientId: id,
    });
    return toCarePlanDto(plan);
  });
}
