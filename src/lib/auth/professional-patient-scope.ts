import type { ProfessionalPatientLinkRepository } from '@/domain/clinical/professional-patient-link';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import type { Session } from './session';

/**
 * Escopo dinâmico do Profissional (R4, RBAC-17/19): sem vínculo com o
 * paciente, o Profissional recebe 404 — nunca vazando se o paciente existe
 * (mesmo padrão 404-não-403 já usado no isolamento por empresa, M2/#23).
 * Papéis que não são "profissional" passam
 * direto — a checagem é só do Profissional.
 */
export async function assertPatientAccessibleToProfessional(
  session: Session,
  patientId: string,
  links: ProfessionalPatientLinkRepository,
): Promise<void> {
  if (session.role !== 'profissional') {
    return;
  }
  const hasLink =
    session.professionalId !== null &&
    (await links.hasLink(session.professionalId, patientId));
  if (!hasLink) {
    throw new NotFoundError('Paciente', patientId);
  }
}

/**
 * Escrita sobre paciente sem vínculo (AD-026, #296): ao contrário da leitura,
 * criar retorno ou entrada na lista de espera para quem não é seu paciente é
 * um ato negado ao Profissional (403), não um paciente "inexistente".
 */
export async function assertPatientLinkedForProfessionalWrite(
  session: Session,
  patientId: string,
  links: ProfessionalPatientLinkRepository,
): Promise<void> {
  if (session.role !== 'profissional') {
    return;
  }
  const hasLink =
    session.professionalId !== null &&
    (await links.hasLink(session.professionalId, patientId));
  if (!hasLink) {
    throw new ForbiddenError(
      'Profissional só pode registrar para pacientes vinculados a ele',
    );
  }
}
