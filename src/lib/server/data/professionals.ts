import 'server-only';
import type { WeeklyWindow } from '@/domain/scheduling/schedule-availability';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  type ProfessionalDto,
  type ProfessionalOptionDto,
  toProfessionalDto,
  toProfessionalOptionDto,
} from '@/lib/dto';

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

/**
 * Cadastro completo, com registro e comissão — a mesma resposta de
 * `GET /api/professionals` (#550). Comissão é dado financeiro: quem chama já
 * passou pela guarda do Admin de Empresa (família administrativa).
 */
export async function listProfessionalsFor(
  session: Session,
): Promise<ProfessionalDto[]> {
  const { professionals } = await getRepositories(sessionScope(session));
  return (await professionals.findAll()).map(toProfessionalDto);
}

/**
 * Horário semanal do profissional (vazio = segue a clínica) — a mesma resposta
 * de `GET /api/professionals/:id/availability`. Profissional de outra empresa
 * não existe: 404.
 */
export async function getProfessionalHoursFor(
  session: Session,
  professionalId: string,
): Promise<{ windows: WeeklyWindow[] }> {
  const { professionals, scheduleAvailability } = await getRepositories(
    sessionScope(session),
  );
  if (!(await professionals.findById(professionalId))) {
    throw new NotFoundError('Profissional', professionalId);
  }
  return {
    windows: await scheduleAvailability.getProfessionalHours(professionalId),
  };
}
