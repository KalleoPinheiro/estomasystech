import type { NextRequest } from 'next/server';
import { AddConditionAssessment } from '@/application/clinical/add-condition-assessment';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toAssessmentDto } from '@/lib/dto';
import { assessmentSchema } from '@/lib/patient-record-schemas';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(sessionScope(guard.session));
    await assertClinicalResourceAccessible(
      guard.session,
      'condition',
      id,
      repos,
    );
    const { assessments, conditions, auditEvents } = repos;
    const [result, condition] = await Promise.all([
      assessments.findByConditionId(id),
      conditions.findById(id),
    ]);
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'assessments',
      resourceId: id,
      patientId: condition?.patientId ?? null,
    });
    return result.map(toAssessmentDto);
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    await assertClinicalResourceAccessible(
      guard.session,
      'condition',
      id,
      repos,
    );
    const body = assessmentSchema.parse(await request.json());
    const { assessments, conditions, auditEvents } = repos;
    const assessment = await new AddConditionAssessment(
      assessments,
      conditions,
    ).execute({
      conditionId: id,
      ...body,
    });
    const condition = await conditions.findById(id);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'assessment',
      resourceId: assessment.id,
      patientId: condition?.patientId ?? null,
    });
    return toAssessmentDto(assessment);
  });
}
