import 'server-only';
import { ListPatients } from '@/application/patients/list-patients';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type PatientDto, toPatientDto } from '@/lib/dto';
import { encodeCursor } from '@/lib/pagination';

export interface PatientsPage {
  items: PatientDto[];
  nextCursor: string | null;
}

/** Cursor opaco pela mesma ordenação da query (fullName, id) — issue #75. */
function nextPatientCursor(page: PatientDto[], limit: number): string | null {
  if (page.length < limit) return null;
  const last = page[page.length - 1];
  return encodeCursor({ fullName: last.fullName, id: last.id });
}

/**
 * Uma página de pacientes da empresa da sessão — a mesma resposta de
 * `GET /api/patients` e a primeira página da tela `/pacientes`. Escopo R4
 * (RBAC-17): o Profissional só enxerga os pacientes com vínculo registrado.
 */
export async function listPatientsPage(
  session: Session,
  options: { search?: string; limit: number; cursor?: string },
): Promise<PatientsPage> {
  const { patients, professionalPatientLinks } = await getRepositories(
    sessionScope(session),
  );
  let allowedPatientIds: string[] | undefined;
  if (session.role === 'profissional') {
    allowedPatientIds = session.professionalId
      ? await professionalPatientLinks.findLinkedPatientIds(
          session.professionalId,
        )
      : [];
  }
  const found = await new ListPatients(patients).execute({
    ...options,
    allowedPatientIds,
  });
  const items = found.map((patient) => toPatientDto(patient));
  return { items, nextCursor: nextPatientCursor(items, options.limit) };
}
