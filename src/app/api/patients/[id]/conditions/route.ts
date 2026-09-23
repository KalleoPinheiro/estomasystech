import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateCondition } from '@/application/clinical/create-condition';
import { ListConditions } from '@/application/clinical/list-conditions';
import {
  CONDITION_KINDS,
  STOMA_TYPES,
} from '@/domain/clinical/clinical-condition';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toConditionDto } from '@/lib/dto';

const conditionSchema = z.object({
  kind: z.enum(CONDITION_KINDS),
  title: z.string().min(1).max(200),
  stomaType: z.enum(STOMA_TYPES).nullish(),
  startedAt: z.iso.datetime().nullish(),
  notes: z.string().max(5000).nullish(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { conditions, auditEvents, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const result = await new ListConditions(conditions).execute({
      patientId: id,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'conditions',
      resourceId: id,
      patientId: id,
    });
    return result.map(toConditionDto);
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = conditionSchema.parse(await request.json());
    const { conditions, patients, auditEvents, professionalPatientLinks } =
      await getRepositories(writeScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const condition = await new CreateCondition(conditions, patients).execute({
      patientId: id,
      kind: body.kind,
      title: body.title,
      stomaType: body.stomaType ?? null,
      startedAt: body.startedAt ? new Date(body.startedAt) : null,
      notes: body.notes ?? null,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'condition',
      resourceId: condition.id,
      patientId: id,
    });
    return toConditionDto(condition);
  });
}
