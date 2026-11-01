import 'server-only';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { type ScheduleClosureDto, toScheduleClosureDto } from '@/lib/dto';

export interface ScheduleConfigView {
  config: ScheduleConfig;
  isDefault: boolean;
}

/**
 * Grade da empresa para a agenda de toda a equipe (#215). Escopo de escrita,
 * como a leitura antiga: sessão sem empresa lê a grade da clínica legada, a
 * mesma que a agenda valida. Mesma resposta de `GET /api/schedule-config`.
 */
export async function loadScheduleConfig(
  session: Session,
): Promise<ScheduleConfigView> {
  const { scheduleConfig } = await getRepositories(writeScope(session));
  const config = await scheduleConfig.get();
  return {
    config: config ?? DEFAULT_SCHEDULE_CONFIG,
    isDefault: config === null,
  };
}

/**
 * Feriados, recessos e ausências que tocam `from`..`to` (`AAAA-MM-DD`). Mesma
 * resposta de `GET /api/settings/schedule/closures`.
 */
export async function listClosuresFor(
  session: Session,
  range: { from: string; to: string },
): Promise<ScheduleClosureDto[]> {
  const { scheduleAvailability } = await getRepositories(sessionScope(session));
  const closures = await scheduleAvailability.listClosures(range);
  return closures.map(toScheduleClosureDto);
}
