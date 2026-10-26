import 'server-only';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type ProfessionalOptionDto, toProfessionalOptionDto } from '@/lib/dto';

/**
 * Profissionais da empresa para os seletores da equipe (#188/#189): sem
 * comissão nem registro, e com os inativos (`active: false`), porque a agenda
 * precisa do nome do profissional de consultas antigas. Mesma resposta de
 * `GET /api/options/professionals`.
 */
export async function listProfessionalOptions(
  session: Session,
): Promise<ProfessionalOptionDto[]> {
  const { professionals } = await getRepositories(sessionScope(session));
  return (await professionals.findAll()).map(toProfessionalOptionDto);
}
