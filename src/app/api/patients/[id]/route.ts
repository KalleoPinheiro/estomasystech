import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { GetPatient } from '@/application/patients/get-patient';
import { SetPatientActive } from '@/application/patients/set-patient-active';
import { UpdatePatient } from '@/application/patients/update-patient';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toPatientDto } from '@/lib/dto';

const updatePatientSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().max(200).nullish(),
  phone: z.string().min(1).max(50).optional(),
  birthDate: z.iso.datetime().nullish(),
  notes: z.string().max(5000).nullish(),
  referredByPartnerId: z.string().max(100).nullish(),
});

const setActiveSchema = z.object({
  active: z.boolean(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { patients, auditEvents, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const patient = await new GetPatient(patients).execute({ id });
    const clinicId = await patients.findClinicIdById(patient.id);
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'patient',
      resourceId: patient.id,
      patientId: patient.id,
      clinicId,
    });
    return toPatientDto(patient);
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updatePatientSchema.parse(await request.json());
    const { patients, partners, professionalPatientLinks } =
      await getRepositories(writeScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const patient = await new UpdatePatient(patients, partners).execute({
      id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      birthDate:
        body.birthDate === undefined
          ? undefined
          : body.birthDate
            ? new Date(body.birthDate)
            : null,
      notes: body.notes === undefined ? undefined : body.notes,
      referredByPartnerId:
        body.referredByPartnerId === undefined
          ? undefined
          : body.referredByPartnerId,
    });
    return toPatientDto(patient);
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = setActiveSchema.parse(await request.json());
    const { patients, professionalPatientLinks } = await getRepositories(
      writeScope(guard.session),
    );
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const patient = await new SetPatientActive(patients).execute({
      id,
      active: body.active,
    });
    return toPatientDto(patient);
  });
}
