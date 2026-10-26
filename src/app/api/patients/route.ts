import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreatePatient } from '@/application/patients/create-patient';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toPatientDto } from '@/lib/dto';
import { createPatientSchema } from '@/lib/patient-input';
import { ensureLinkBestEffort } from '@/lib/patient-link';
import { listPatientsPage } from '@/lib/server/data/patients';

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  // O cursor da próxima página sai junto da lista: guarda-o numa variável de
  // fora para o `buildMeta` do `handleRequest`, que só roda depois da ação.
  let nextCursor: string | null = null;

  return handleRequest(
    async () => {
      const params = request.nextUrl.searchParams;
      const page = paginationSchema.parse({
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      });
      const result = await listPatientsPage(guard.session, {
        search: params.get('search') ?? undefined,
        limit: page.limit,
        cursor: page.cursor,
      });
      nextCursor = result.nextCursor;
      return result.items;
    },
    () => ({ nextCursor }),
  );
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createPatientSchema.parse(await request.json());
    if (body.guardianId) assertCanManageGuardians(guard.session);
    const {
      patients,
      partners,
      guardians,
      professionalPatientLinks,
      auditEvents,
    } = await getRepositories(writeScope(guard.session));
    const patient = await new CreatePatient(
      patients,
      partners,
      guardians,
    ).execute({
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      cpf: body.cpf ?? null,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      notes: body.notes ?? null,
      referredByPartnerId: body.referredByPartnerId ?? null,
      guardianId: body.guardianId ?? null,
    });
    // Profissional que cadastra um paciente ganha acesso imediato a ele,
    // mesmo antes de qualquer agendamento (RBAC-17/18).
    if (guard.session.role === 'profissional' && guard.session.professionalId) {
      await ensureLinkBestEffort(
        professionalPatientLinks,
        guard.session.professionalId,
        patient.id,
      );
    }
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'patient',
      resourceId: patient.id,
      patientId: patient.id,
    });
    return toPatientDto(patient);
  });
}
