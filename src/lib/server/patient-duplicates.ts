import 'server-only';
import { FindPossibleDuplicates } from '@/application/patients/find-possible-duplicates';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type PatientDto, toPatientDto } from '@/lib/dto';

export interface DuplicateCheckInput {
  fullName: string;
  phone: string;
  /** AAAA-MM-DD; sem ela só o celular compara. */
  birthDate?: string | null;
}

/**
 * Possíveis repetidos antes do cadastro (#992), na empresa da sessão: a mesma
 * resposta da rota (cadastro rápido) e da Server Action (cadastro completo).
 * Leitura sem gravação: sem auditoria, como a busca da lista. O Profissional
 * só vê os pacientes com vínculo (R4).
 */
export async function findPossibleDuplicatesFor(
  session: Session,
  input: DuplicateCheckInput,
): Promise<PatientDto[]> {
  const { patients, professionalPatientLinks } = await getRepositories(
    sessionScope(session),
  );
  const found = await new FindPossibleDuplicates(
    patients,
    professionalPatientLinks,
  ).execute({
    fullName: input.fullName,
    phone: input.phone,
    birthDate: input.birthDate ? new Date(input.birthDate) : null,
    professionalId:
      session.role === 'profissional' ? session.professionalId : undefined,
  });
  return found.map((patient) => toPatientDto(patient));
}
