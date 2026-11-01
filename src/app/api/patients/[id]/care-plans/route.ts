import type { NextRequest } from 'next/server';
import { OpenCarePlan } from '@/application/clinical/open-care-plan';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { resolveSessionProfessionalId } from '@/lib/auth/session-professional';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanDto } from '@/lib/dto';
import { openCarePlanSchema } from '@/lib/patient-record-schemas';
import { listPatientCarePlans } from '@/lib/server/data/patient-record';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    listPatientCarePlans(guard.session, (await context.params).id),
  );
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
      userAccounts,
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
      // Autoria pela sessão (#200) — o corpo não escolhe o profissional.
      professionalId: await resolveSessionProfessionalId(
        guard.session,
        userAccounts,
      ),
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
