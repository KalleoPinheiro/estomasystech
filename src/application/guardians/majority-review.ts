import type { UserAccountRepository } from '@/domain/auth/user-account';
import type {
  ConsentRecordRepository,
  ConsentSigner,
} from '@/domain/consent/consent-record';
import type { PartnerShareConsentRepository } from '@/domain/consent/partner-share-consent';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import {
  isRepresentativeConsentExpired,
  majorityBirthCutoff,
  representativeConsentExpiresOn,
} from '@/domain/patient/majority';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';

export interface MajorityReviewItem {
  patient: Patient;
  guardianName: string;
  guardianRelationship: string;
  /** Ainda só com o responsável no portal: a clínica transfere ou mantém (#372). */
  awaitingTransfer: boolean;
  /** Primeiro dia em que o aceite do representante não vale (#375); nulo sem aceite dele vigente. */
  representativeConsentExpiresOn: Date | null;
  representativeConsentExpired: boolean;
}

interface MajorityRepos {
  userAccounts: UserAccountRepository;
  patients: PatientRepository;
  guardians: GuardianRepository;
  consentRecords: ConsentRecordRepository;
  partnerShareConsents: PartnerShareConsentRepository;
}

/** Registro mais recente de cada grupo; no empate, a revogação vence. */
function latestBy<T extends { kind: string; signer: ConsentSigner | null }>(
  records: readonly T[],
  group: (record: T) => string,
  at: (record: T) => Date,
): T[] {
  const latest = new Map<string, T>();
  for (const record of records) {
    const key = group(record);
    const seen = latest.get(key);
    const newer =
      !seen ||
      at(record).getTime() > at(seen).getTime() ||
      (at(record).getTime() === at(seen).getTime() && record.kind === 'revoke');
    if (newer) latest.set(key, record);
  }
  return [...latest.values()];
}

/** Representante que assinou o aceite ainda vigente (termos ou parceiro), ou `null`. */
async function currentRepresentativeSigner(
  repos: MajorityRepos,
  patientId: string,
): Promise<ConsentSigner | null> {
  const [terms, partner] = await Promise.all([
    repos.consentRecords.findByPatientId(patientId),
    repos.partnerShareConsents.findByPatientId(patientId),
  ]);
  const current = [
    ...latestBy(
      terms,
      (r) => r.purpose,
      (r) => r.acceptedAt,
    ),
    ...latestBy(
      partner,
      (r) => r.partnerId,
      (r) => r.recordedAt,
    ),
  ];
  return (
    current.find((record) => record.kind === 'accept' && record.signer)
      ?.signer ?? null
  );
}

/**
 * Aviso de maioridade (#372, ADR-032; #375, ADR-033). Junta dois casos de
 * paciente já maior de idade:
 * - ainda no portal só pelo responsável (conta ativa do responsável, sem conta
 *   própria, sem decisão da clínica): a clínica transfere ou mantém;
 * - com aceite do representante ainda vigente (termos ou parceiro): vence 90
 *   dias depois dos 18 anos e a clínica precisa pedir o aceite ao paciente.
 */
export async function listMajorityReviews(
  repos: MajorityRepos,
  now: Date = new Date(),
): Promise<MajorityReviewItem[]> {
  const cutoff = majorityBirthCutoff(now);
  const awaiting = await awaitingTransfer(repos, cutoff);
  const signedIds = new Set([
    ...(await repos.consentRecords.findPatientIdsSignedByRepresentative()),
    ...(await repos.partnerShareConsents.findPatientIdsSignedByRepresentative()),
  ]);
  const signedPatients = (
    await repos.patients.findByIds(
      [...signedIds].filter((id) => !awaiting.some((p) => p.id === id)),
    )
  ).filter(
    (patient) =>
      patient.isActive && patient.birthDate && !patient.isMinorOn(now),
  );
  const candidates = [...awaiting, ...signedPatients];
  if (candidates.length === 0) return [];

  const signers = await Promise.all(
    candidates.map((patient) => currentRepresentativeSigner(repos, patient.id)),
  );
  const guardians = new Map(
    (
      await repos.guardians.findByIds(
        candidates.flatMap((patient, index) =>
          [patient.guardianId, signers[index]?.guardianId].filter(
            (id): id is string => !!id,
          ),
        ),
      )
    ).map((guardian) => [guardian.id, guardian]),
  );

  const awaitingIds = new Set(awaiting.map((patient) => patient.id));
  const items = candidates.flatMap((patient, index): MajorityReviewItem[] => {
    const signer = signers[index];
    const isAwaiting = awaitingIds.has(patient.id);
    if (!isAwaiting && !signer) return [];
    const guardian =
      guardians.get(signer?.guardianId ?? '') ??
      guardians.get(patient.guardianId ?? '');
    const expiresOn =
      signer && patient.birthDate
        ? representativeConsentExpiresOn(patient.birthDate)
        : null;
    return [
      {
        patient,
        guardianName: guardian?.fullName ?? '',
        guardianRelationship:
          guardian?.relationship ?? signer?.relationship ?? '',
        awaitingTransfer: isAwaiting,
        representativeConsentExpiresOn: expiresOn,
        representativeConsentExpired:
          !!signer && isRepresentativeConsentExpired(patient.birthDate, now),
      },
    ];
  });
  return items.sort((a, b) =>
    a.patient.fullName.localeCompare(b.patient.fullName),
  );
}

/** Já maiores, ainda no portal só pelo responsável e sem decisão da clínica. */
async function awaitingTransfer(
  repos: MajorityRepos,
  cutoff: Date,
): Promise<Patient[]> {
  const guardianIds = (await repos.userAccounts.findByRole('guardian')).flatMap(
    (account) =>
      account.isActive && account.guardianId ? [account.guardianId] : [],
  );
  const candidates = await repos.patients.findAdultsAwaitingMajorityReview(
    guardianIds,
    cutoff,
  );
  // Poucos por vez (só quem fez 18 anos e ainda não foi visto): uma consulta
  // por candidato é mais barata que ler todas as contas de paciente.
  const ownAccounts = await Promise.all(
    candidates.map((patient) =>
      repos.userAccounts.findByPortalLink({ patientId: patient.id }),
    ),
  );
  return candidates.filter((_, index) => !ownAccounts[index]?.isActive);
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
