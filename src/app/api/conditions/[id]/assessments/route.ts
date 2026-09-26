import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AddConditionAssessment } from '@/application/clinical/add-condition-assessment';
import { EXUDATE_LEVELS } from '@/domain/clinical/condition-assessment';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toAssessmentDto } from '@/lib/dto';

const detArea = z.number().int().min(0).max(3).nullish();
const detSeverity = z.number().int().min(0).max(2).nullish();

const assessmentSchema = z.object({
  lengthMm: z.number().int().min(0).max(10_000).nullish(),
  widthMm: z.number().int().min(0).max(10_000).nullish(),
  depthMm: z.number().int().min(0).max(10_000).nullish(),
  tissueType: z.string().max(200).nullish(),
  exudate: z.enum(EXUDATE_LEVELS).nullish(),
  painScale: z.number().int().min(0).max(10).nullish(),
  skinCondition: z.string().max(1000).nullish(),
  complications: z.string().max(1000).nullish(),
  complicationCodes: z.string().max(500).nullish(),
  detDiscolorationArea: detArea,
  detDiscolorationSeverity: detSeverity,
  detErosionArea: detArea,
  detErosionSeverity: detSeverity,
  detOvergrowthArea: detArea,
  detOvergrowthSeverity: detSeverity,
  notes: z.string().max(5000).nullish(),
});

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
