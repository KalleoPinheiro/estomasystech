import 'server-only';
import { ListFollowUps } from '@/application/followups/list-follow-ups';
import type { FollowUpStatus } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { linkedPatientFilter } from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { type FollowUpDto, toFollowUpDto } from '@/lib/dto';

/**
 * Retornos da empresa da sessão. Escopo R4 (#186): o motivo do retorno é
 * clínico, então o Profissional só vê os dos pacientes vinculados. Mesma
 * resposta de `GET /api/follow-ups`, que reaproveita esta função, e fonte do
 * cartão «Retornos pendentes» da tela Hoje.
 */
export async function listFollowUpsFor(
  session: Session,
  filter: { status?: FollowUpStatus; patientId?: string } = {},
): Promise<FollowUpDto[]> {
  const { followUps, patients, reminderLog, professionalPatientLinks } =
    await getRepositories(sessionScope(session));
  const isLinked = await linkedPatientFilter(session, professionalPatientLinks);
  const result = (
    await new ListFollowUps(followUps, patients).execute(filter)
  ).filter(({ followUp }) => isLinked(followUp.patientId));
  // Selo "3 lembretes sem resposta": recall por e-mail na última tentativa.
  const exhausted = await reminderLog.exhaustedRecalls(
    result.map(({ followUp }) => followUp.id),
  );
  return result.map(({ followUp, patientName, patientBirthDate, isOverdue }) =>
    toFollowUpDto(
      followUp,
      patientName,
      isOverdue,
      exhausted.has(followUp.id),
      patientBirthDate,
    ),
  );
}
