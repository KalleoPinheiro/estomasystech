import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import type { ConsentSigner } from '@/domain/consent/consent-record';
import { canRepresentMinor } from '@/domain/guardian/guardian';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/domain/shared/errors';

/** O que o portal sabe de quem está logado: o e-mail de login e o papel. */
export interface PortalSessionIdentity {
  subject: string;
  role: UserRole;
  /** Empresa da sessão — a trilha do responsável (ADR-027) nasce nela. */
  clinicId?: string | null;
  /** Paciente que o responsável escolheu representar (cookie; revalidado aqui). */
  actingPatientId?: string | null;
}

export const GUARDIAN_PICK_PATIENT_MESSAGE =
  'Escolha o paciente que você está representando.';

/** Conta própria de paciente menor não entra no portal (#372, ADR-032). */
export const MINOR_PATIENT_PORTAL_MESSAGE =
  'Paciente menor de 18 anos não tem acesso próprio ao portal: quem acessa é o representante legal. Fale com a clínica.';

/** Aceite e revogação dos termos de adulto são só do próprio paciente (ADR-027). */
export const ADULT_CONSENT_ONLY_MESSAGE =
  'O aceite dos termos é do próprio paciente. Como responsável, você só assina pelo paciente menor de idade.';

type PortalRepos = {
  userAccounts: UserAccountRepository;
  patients: PatientRepository;
  guardians: GuardianRepository;
};

/** Recurso da trilha: cada requisição do responsável em nome de um paciente. */
export const GUARDIAN_ACCESS_RESOURCE = 'guardian-access';

/**
 * Titular do portal pelo vínculo da conta (#196), nunca pelo e-mail do
 * cadastro: o e-mail do paciente/parceiro é corrigido e reaproveitado pela
 * recepção, e casar por ele abria o prontuário de outra pessoa. A conta é a da
 * sessão (e-mail de login + empresa, pelo repositório escopado), com o mesmo
 * papel, ativa e vinculada; o cadastro precisa estar ativo. Qualquer falha é
 * o mesmo 404 — não revela qual elo faltou.
 */
async function linkedAccount(
  accounts: UserAccountRepository,
  session: PortalSessionIdentity,
) {
  const account = await accounts.findByEmail(session.subject);
  if (!account?.isActive || account.role !== session.role) {
    return null;
  }
  return account;
}

/**
 * Pacientes ativos que a conta de responsável pode representar: os ligados ao
 * cadastro dela (`patients.guardian_id`). Desvincular o paciente, inativá-lo,
 * desativar a conta ou o paciente encerrar o acesso (ADR-028) tira o paciente
 * da lista sem mais nenhum passo (ADR-027). Paciente menor só é representado
 * por mãe, pai ou representante legal (#372, ADR-032): avô ou cuidador sem
 * tutela não vê o menor, mesmo vinculado.
 */
export async function listRepresentablePatients(
  repos: PortalRepos,
  session: PortalSessionIdentity,
): Promise<Patient[]> {
  const account = await linkedAccount(repos.userAccounts, session);
  if (account?.role !== 'guardian' || !account.guardianId) {
    throw new NotFoundError('Responsável', account?.id ?? 'sem-conta');
  }
  const [linked, guardian] = await Promise.all([
    repos.patients.findByGuardian(account.guardianId),
    repos.guardians.findById(account.guardianId),
  ]);
  const representsMinors =
    !!guardian && canRepresentMinor(guardian.relationship);
  const now = new Date();
  return linked.filter(
    (patient) =>
      patient.isActive &&
      !patient.guardianPortalRevokedAt &&
      (representsMinors || !patient.isMinorOn(now)),
  );
}

/**
 * Responsável age em nome de um paciente: o escolhido (cookie), ou o único
 * representado. Cada resolução grava `read`/`guardian-access` ANTES de seguir
 * (write-ahead): sem trilha, o responsável não acessa nada. Ator = e-mail da
 * conta do responsável; titular = paciente (`patientId`).
 */
async function resolveGuardianPatient(
  repos: PortalRepos & { auditEvents: AuditEventRepository },
  session: PortalSessionIdentity,
  account: UserAccount,
): Promise<Patient> {
  const represented = await listRepresentablePatients(repos, session);
  const chosen =
    represented.find((patient) => patient.id === session.actingPatientId) ??
    (represented.length === 1 ? represented[0] : undefined);
  if (!chosen) {
    if (represented.length > 1) {
      throw new ConflictError(GUARDIAN_PICK_PATIENT_MESSAGE);
    }
    throw new NotFoundError('Paciente', account.id);
  }
  await repos.auditEvents.save(
    AuditEvent.create({
      clinicId: session.clinicId ?? account.clinicId,
      actorRole: 'guardian',
      actorId: session.subject,
      action: 'read',
      resourceType: GUARDIAN_ACCESS_RESOURCE,
      resourceId: chosen.id,
      patientId: chosen.id,
      detail: 'acesso do responsável em nome do paciente',
    }),
  );
  return chosen;
}

export async function resolvePortalPatient(
  repos: PortalRepos & { auditEvents: AuditEventRepository },
  session: PortalSessionIdentity,
): Promise<Patient> {
  const account = await linkedAccount(repos.userAccounts, session);
  if (account?.role === 'guardian') {
    return resolveGuardianPatient(repos, session, account);
  }
  const patient = account?.patientId
    ? await repos.patients.findById(account.patientId)
    : null;
  if (!patient?.isActive) {
    // `subject` é o e-mail de login: não vai para o log (#219).
    throw new NotFoundError('Paciente', account?.id ?? 'sem-conta');
  }
  if (patient.isMinorOn()) {
    // Conta criada antes da #372 ou data de nascimento corrigida depois: o
    // menor não acessa sozinho (LGPD, art. 14).
    throw new ForbiddenError(MINOR_PATIENT_PORTAL_MESSAGE);
  }
  return patient;
}

/**
 * Titular e quem assina os termos (TCLE e imagem, #372, ADR-032): o paciente
 * adulto assina por si (`signer` nulo); o representante legal assina pelo
 * menor, com o cadastro e o parentesco gravados no registro. Responsável de
 * paciente adulto recebe `403`: o aceite continua personalíssimo (ADR-027).
 */
export async function resolveConsentSigner(
  repos: PortalRepos & { auditEvents: AuditEventRepository },
  session: PortalSessionIdentity,
): Promise<{ patient: Patient; signer: ConsentSigner | null }> {
  const patient = await resolvePortalPatient(repos, session);
  return { patient, signer: await consentSignerFor(repos, session, patient) };
}

/** Quem assina por `patient` já resolvido; `403` para o responsável de adulto. */
export async function consentSignerFor(
  repos: Pick<PortalRepos, 'guardians'>,
  session: PortalSessionIdentity,
  patient: Patient,
): Promise<ConsentSigner | null> {
  if (session.role !== 'guardian') return null;
  const guardian = patient.guardianId
    ? await repos.guardians.findById(patient.guardianId)
    : null;
  if (
    !guardian ||
    !patient.isMinorOn() ||
    !canRepresentMinor(guardian.relationship)
  ) {
    throw new ForbiddenError(ADULT_CONSENT_ONLY_MESSAGE);
  }
  return { guardianId: guardian.id, relationship: guardian.relationship };
}

export async function resolvePortalPartner(
  repos: { userAccounts: UserAccountRepository; partners: PartnerRepository },
  session: PortalSessionIdentity,
): Promise<Partner> {
  const account = await linkedAccount(repos.userAccounts, session);
  const partner = account?.partnerId
    ? await repos.partners.findById(account.partnerId)
    : null;
  if (!partner?.isActive) {
    throw new NotFoundError('Parceiro', account?.id ?? 'sem-conta');
  }
  return partner;
}
