import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreatePatient } from '@/application/patients/create-patient';
import { ListPatients } from '@/application/patients/list-patients';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import type { PatientDto } from '@/lib/dto';
import { toPatientDto } from '@/lib/dto';
import { encodeCursor } from '@/lib/pagination';
import { ensureLinkBestEffort } from '@/lib/patient-link';

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

/** Cursor opaco pela mesma ordenação da query (fullName, id) — issue #75. */
function nextPatientCursor(page: PatientDto[], limit: number): string | null {
  if (page.length < limit) return null;
  const last = page[page.length - 1];
  return encodeCursor({ fullName: last.fullName, id: last.id });
}

const createPatientSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().max(200).nullish(),
  phone: z.string().min(1).max(50),
  cpf: z.string().max(20).nullish(),
  birthDate: z.iso.datetime().nullish(),
  notes: z.string().max(5000).nullish(),
  referredByPartnerId: z.string().max(100).nullish(),
  guardianId: z.string().max(100).nullish(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  // `limit` sai fora do try/catch do handleRequest (usado no buildMeta, que só
  // roda depois do action resolver) — por isso fica numa variável de fora,
  // atribuída dentro do action para que erros de zod ainda virem 400.
  let limit = 0;

  return handleRequest(
    async () => {
      const params = request.nextUrl.searchParams;
      const search = params.get('search') ?? undefined;
      const parsedPage = paginationSchema.parse({
        limit: params.get('limit') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
      });
      limit = parsedPage.limit;

      const { patients, professionalPatientLinks } = await getRepositories(
        sessionScope(guard.session),
      );
      // Escopo dinâmico do Profissional (R4/RBAC-17): a listagem só mostra
      // pacientes com quem o profissional tem vínculo registrado.
      let allowedPatientIds: string[] | undefined;
      if (guard.session.role === 'profissional') {
        allowedPatientIds = guard.session.professionalId
          ? await professionalPatientLinks.findLinkedPatientIds(
              guard.session.professionalId,
            )
          : [];
      }
      const result = await new ListPatients(patients).execute({
        search,
        limit,
        cursor: parsedPage.cursor,
        allowedPatientIds,
      });
      return result.map((p) => toPatientDto(p));
    },
    (result) => ({ nextCursor: nextPatientCursor(result, limit) }),
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
