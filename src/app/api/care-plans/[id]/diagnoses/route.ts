import type { NextRequest } from 'next/server';
import { AddCarePlanDiagnosis } from '@/application/clinical/add-care-plan-diagnosis';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanDiagnosisDto } from '@/lib/dto';
import { diagnosisSchema } from '@/lib/patient-record-schemas';

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
    const body = diagnosisSchema.parse(await request.json());
    const { carePlanDiagnoses, carePlans, nursingDiagnoses, auditEvents } =
      repos;
    const diagnosis = await new AddCarePlanDiagnosis(
      carePlanDiagnoses,
      carePlans,
      nursingDiagnoses,
    ).execute({
      carePlanId: id,
      diagnosisCode: body.diagnosisCode,
      type: body.type,
      relatedFactors: body.relatedFactors ?? null,
      definingCharacteristics: body.definingCharacteristics ?? null,
    });
    const [plan, catalogEntry] = await Promise.all([
      carePlans.findById(id),
      nursingDiagnoses.findByCode(body.diagnosisCode),
    ]);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'care_plan_diagnosis',
      resourceId: diagnosis.id,
      patientId: plan?.patientId ?? null,
    });
    return toCarePlanDiagnosisDto(
      diagnosis,
      catalogEntry?.label ?? diagnosis.diagnosisCode,
    );
  });
}
