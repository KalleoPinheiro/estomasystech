import type { NextRequest } from 'next/server';
import { SetPatientActive } from '@/application/patients/set-patient-active';
import { UpdatePatient } from '@/application/patients/update-patient';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { Patient } from '@/domain/patient/patient';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toPatientDto } from '@/lib/dto';
import {
  setActiveSchema,
  updatePatientSchema,
} from '@/lib/patient-record-schemas';
import { getPatientRecord } from '@/lib/server/data/patient-record';

async function loadGuardian(guardians: GuardianRepository, patient: Patient) {
  return patient.guardianId ? guardians.findById(patient.guardianId) : null;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    getPatientRecord(guard.session, (await context.params).id),
  );
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = updatePatientSchema.parse(await request.json());
    if (body.guardianId !== undefined) assertCanManageGuardians(guard.session);
    const {
      patients,
      partners,
      guardians,
      professionalPatientLinks,
      auditEvents,
    } = await getRepositories(writeScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const patient = await new UpdatePatient(
      patients,
      partners,
      guardians,
    ).execute({
      id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      cpf: body.cpf,
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
      guardianId: body.guardianId,
    });
    if (body.guardianId !== undefined) {
      recordAudit(auditEvents, guard.session, {
        action: 'update',
        resourceType: 'patient',
        resourceId: patient.id,
        patientId: patient.id,
        detail: body.guardianId
          ? `responsável vinculado: ${body.guardianId}`
          : 'responsável desvinculado',
      });
    }
    return toPatientDto(patient, await loadGuardian(guardians, patient));
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
