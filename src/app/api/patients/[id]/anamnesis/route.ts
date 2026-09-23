import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { GetAnamnesis } from '@/application/clinical/get-anamnesis';
import { UpsertAnamnesis } from '@/application/clinical/upsert-anamnesis';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toAnamnesisDto } from '@/lib/dto';

const anamnesisSchema = z.object({
  comorbidities: z.string().max(5000).optional(),
  allergies: z.string().max(5000).optional(),
  medications: z.string().max(5000).optional(),
  surgicalHistory: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { anamneses, auditEvents, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const anamnesis = await new GetAnamnesis(anamneses).execute({
      patientId: id,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: id,
      patientId: id,
    });
    return anamnesis ? toAnamnesisDto(anamnesis) : null;
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = anamnesisSchema.parse(await request.json());
    const { anamneses, patients, auditEvents, professionalPatientLinks } =
      await getRepositories(writeScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const anamnesis = await new UpsertAnamnesis(anamneses, patients).execute({
      patientId: id,
      ...body,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'update',
      resourceType: 'anamnesis',
      resourceId: id,
      patientId: id,
    });
    return toAnamnesisDto(anamnesis);
  });
}
