import 'server-only';
import { findWaitlistMatches } from '@/application/scheduling/waitlist';
import { getRepositories } from '@/infrastructure/container';
import { linkedPatientFilter } from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import type { WaitlistEntryDto } from '@/lib/dto';
import { waitlistWithNames } from '@/lib/waitlist-names';

/**
 * Fila ativa por ordem de chegada. Com `date` (e `professionalId` opcional),
 * só quem aceita um horário vago nesse dia. Escopo R4 (#186): o Profissional só
 * vê a fila dos pacientes vinculados. Mesma resposta de `GET /api/waitlist`.
 */
export async function listWaitlistFor(
  session: Session,
  filter: { date?: string; professionalId?: string | null } = {},
): Promise<WaitlistEntryDto[]> {
  const services = await getRepositories(sessionScope(session));
  const entries = filter.date
    ? await findWaitlistMatches(
        services.waitlist,
        filter.date,
        filter.professionalId ?? null,
      )
    : await services.waitlist.listWaiting();
  const isLinked = await linkedPatientFilter(
    session,
    services.professionalPatientLinks,
  );
  return waitlistWithNames(
    services,
    entries.filter((entry) => isLinked(entry.patientId)),
  );
}
