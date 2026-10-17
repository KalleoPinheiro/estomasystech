import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { ValidationError } from '@/domain/shared/errors';

export const GUARDIAN_AUTHORIZATION_MESSAGE =
  'Confirme que o paciente (ou o representante legal dele) autorizou o acesso do responsável ao portal';

/**
 * Pré-condições para dar à pessoa responsável uma conta de portal (ADR-027):
 * o cadastro existe na empresa, há ao menos um paciente ativo ligado a ele e a
 * equipe atestou a autorização do paciente. Cadastro de outra empresa nem é
 * encontrado (repositórios escopados).
 */
export async function assertCanGrantGuardianAccess(
  repos: { guardians: GuardianRepository; patients: PatientRepository },
  guardianId: string | null | undefined,
  authorizationConfirmed: boolean,
): Promise<void> {
  if (!guardianId || !(await repos.guardians.findById(guardianId))) {
    throw new ValidationError('Responsável vinculado não encontrado');
  }
  if (!authorizationConfirmed) {
    throw new ValidationError(GUARDIAN_AUTHORIZATION_MESSAGE);
  }
  const linked = await repos.patients.findByGuardian(guardianId);
  if (!linked.some((patient) => patient.isActive)) {
    throw new ValidationError(
      'Ligue o responsável a um paciente ativo antes de dar acesso ao portal',
    );
  }
}
