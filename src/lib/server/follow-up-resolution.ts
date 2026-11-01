import type { FollowUp } from '@/domain/followup/follow-up';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { AuditInput } from '@/lib/audit';
import { assertPatientLinkedForProfessionalWrite } from '@/lib/auth/professional-patient-scope';
import type { Session } from '@/lib/auth/session';
import type { TenantScope } from '@/lib/auth/tenant-scope';

/**
 * Regra única para concluir ou cancelar um retorno, compartilhada pela Server
 * Action da Hoje e por `PATCH /api/follow-ups/:id` (#597): as duas entradas
 * aplicam o mesmo escopo de empresa, a mesma R4 e a mesma trilha de auditoria.
 */

/**
 * Autoriza o recurso antes de gravar: retorno de outra empresa é 404 (o escopo
 * de empresa não o enxerga) e Profissional sem vínculo com o paciente é 403 (R4).
 */
export async function authorizeFollowUpResolution(
  session: Session,
  scope: TenantScope,
  id: string,
): Promise<void> {
  const { followUps, professionalPatientLinks } = await getRepositories(scope);
  const followUp = await followUps.findById(id);
  if (!followUp) {
    throw new NotFoundError('Retorno', id);
  }
  await assertPatientLinkedForProfessionalWrite(
    session,
    followUp.patientId,
    professionalPatientLinks,
  );
}

export const toFollowUpResolution = (followUp: FollowUp) => ({
  id: followUp.id,
  patientId: followUp.patientId,
  status: followUp.status,
});

export type FollowUpResolution = ReturnType<typeof toFollowUpResolution>;

export const followUpResolutionAudit = (
  result: FollowUpResolution,
): AuditInput => ({
  action: 'update',
  resourceType: 'follow_up',
  resourceId: result.id,
  patientId: result.patientId,
  detail: `retorno: ${result.status}`,
});
