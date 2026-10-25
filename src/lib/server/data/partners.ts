import 'server-only';
import { ListPartners } from '@/application/partners/list-partners';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type PartnerDto, toPartnerDto } from '@/lib/dto';

/** Parceiros da empresa da sessão — a mesma resposta de `GET /api/partners`. */
export async function listPartnersFor(session: Session): Promise<PartnerDto[]> {
  const { partners } = await getRepositories(sessionScope(session));
  const result = await new ListPartners(partners).execute();
  return result.map(toPartnerDto);
}
