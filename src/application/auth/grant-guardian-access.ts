import { canRepresentMinor } from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { ValidationError } from '@/domain/shared/errors';

export const GUARDIAN_AUTHORIZATION_MESSAGE =
  'Confirme que o paciente (ou o representante legal dele) autorizou o acesso do responsável ao portal';

export const MINOR_PATIENT_ACCOUNT_MESSAGE =
  'Paciente menor de 18 anos não tem conta própria no portal. Dê o acesso ao representante legal (mãe, pai ou tutor) pelo cadastro do responsável.';

export const MINOR_NEEDS_LEGAL_REPRESENTATIVE_MESSAGE =
  'Paciente menor só é acessado pelo representante legal. Cadastre o parentesco como mãe, pai ou representante legal (tutor) para dar o acesso.';

/**
 * Pré-condições para dar à pessoa responsável uma conta de portal (ADR-027):
 * o cadastro existe na empresa, há ao menos um paciente ativo ligado a ele e a
 * equipe atestou a autorização do paciente (ou, no menor, do representante).
 * Cadastro de outra empresa nem é encontrado (repositórios escopados).
 */
export async function assertCanGrantGuardianAccess(
  repos: { guardians: GuardianRepository; patients: PatientRepository },
  guardianId: string | null | undefined,
  authorizationConfirmed: boolean,
): Promise<void> {
  const guardian = guardianId
    ? await repos.guardians.findById(guardianId)
    : null;
  if (!guardianId || !guardian) {
    throw new ValidationError('Responsável vinculado não encontrado');
  }
  if (!authorizationConfirmed) {
    throw new ValidationError(GUARDIAN_AUTHORIZATION_MESSAGE);
  }
  const active = (await repos.patients.findByGuardian(guardianId)).filter(
    (patient) => patient.isActive,
  );
  if (active.length === 0) {
    throw new ValidationError(
      'Ligue o responsável a um paciente ativo antes de dar acesso ao portal',
    );
  }
  // Menor só é representado por mãe, pai ou tutor (#372, ADR-032): sem nenhum
  // paciente que ele possa representar, a conta nasceria inútil.
  if (
    !canRepresentMinor(guardian.relationship) &&
    active.every((patient) => patient.isMinorOn())
  ) {
    throw new ValidationError(MINOR_NEEDS_LEGAL_REPRESENTATIVE_MESSAGE);
  }
}
