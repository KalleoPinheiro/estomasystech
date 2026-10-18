import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import { majorityBirthCutoff } from '@/domain/patient/majority';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

export interface MajorityReviewItem {
  patient: Patient;
  guardianName: string;
  guardianRelationship: string;
}

interface MajorityRepos {
  userAccounts: UserAccountRepository;
  patients: PatientRepository;
  guardians: GuardianRepository;
}

/**
 * Pacientes que fizeram 18 anos e ainda estão no portal só pelo responsável
 * (#372, ADR-032): o responsável tem conta ativa, o paciente não tem conta
 * própria e a clínica ainda não decidiu manter o acesso com o responsável.
 * É o aviso para a clínica transferir o acesso ao próprio paciente.
 */
export async function listMajorityReviews(
  repos: MajorityRepos,
  now: Date = new Date(),
): Promise<MajorityReviewItem[]> {
  const guardianIds = (await repos.userAccounts.findByRole('guardian')).flatMap(
    (account) =>
      account.isActive && account.guardianId ? [account.guardianId] : [],
  );
  const candidates = await repos.patients.findAdultsAwaitingMajorityReview(
    guardianIds,
    majorityBirthCutoff(now),
  );
  // Poucos por vez (só quem fez 18 anos e ainda não foi visto): uma consulta
  // por candidato é mais barata que ler todas as contas de paciente.
  const ownAccounts = await Promise.all(
    candidates.map((patient) =>
      repos.userAccounts.findByPortalLink({ patientId: patient.id }),
    ),
  );
  const adults = candidates.filter((_, index) => !ownAccounts[index]?.isActive);
  if (adults.length === 0) return [];

  const guardians = new Map(
    (
      await repos.guardians.findByIds(
        adults.flatMap((patient) =>
          patient.guardianId ? [patient.guardianId] : [],
        ),
      )
    ).map((guardian) => [guardian.id, guardian]),
  );
  return adults.flatMap((patient) => {
    const guardian = patient.guardianId
      ? guardians.get(patient.guardianId)
      : undefined;
    return guardian
      ? [
          {
            patient,
            guardianName: guardian.fullName,
            guardianRelationship: guardian.relationship,
          },
        ]
      : [];
  });
}

export const MAJORITY_NOT_REACHED_MESSAGE =
  'O paciente ainda é menor de idade: o acesso continua com o representante legal';

/**
 * A clínica decide manter o acesso com o responsável depois dos 18 anos (ex.:
 * curatela, ou o paciente pediu). Sai do aviso; trocar o responsável zera a
 * marca. `beforeSave` grava a trilha depois de validar e antes de mudar
 * (write-ahead): sem trilha, nada muda.
 */
export async function keepGuardianAfterMajority(
  repos: Pick<MajorityRepos, 'patients'>,
  patientId: string,
  beforeSave: () => Promise<void>,
  now: Date = new Date(),
): Promise<Patient> {
  const patient = await repos.patients.findById(patientId);
  if (!patient?.isActive || !patient.guardianId) {
    throw new NotFoundError('Paciente', patientId);
  }
  if (!patient.birthDate || patient.isMinorOn(now)) {
    throw new ValidationError(MAJORITY_NOT_REACHED_MESSAGE);
  }
  const reviewed = patient.markMajorityReviewed(now);
  await beforeSave();
  await repos.patients.save(reviewed);
  return reviewed;
}
