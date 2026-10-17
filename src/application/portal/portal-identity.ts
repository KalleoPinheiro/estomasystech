import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { ConflictError, NotFoundError } from '@/domain/shared/errors';

/** O que o portal sabe de quem está logado: o e-mail de login e o papel. */
export interface PortalSessionIdentity {
  subject: string;
  role: UserRole;
  /** Empresa da sessão — a trilha do responsável (ADR-026) nasce nela. */
  clinicId?: string | null;
  /** Paciente que o responsável escolheu representar (cookie; revalidado aqui). */
  actingPatientId?: string | null;
}

export const GUARDIAN_PICK_PATIENT_MESSAGE =
  'Escolha o paciente que você está representando.';

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
 * cadastro dela (`patients.guardian_id`). Desvincular o paciente, inativá-lo ou
 * desativar a conta encerra o acesso sem mais nenhum passo (ADR-026).
 */
export async function listRepresentablePatients(
  repos: { userAccounts: UserAccountRepository; patients: PatientRepository },
  session: PortalSessionIdentity,
): Promise<Patient[]> {
  const account = await linkedAccount(repos.userAccounts, session);
  if (account?.role !== 'guardian' || !account.guardianId) {
    throw new NotFoundError('Responsável', account?.id ?? 'sem-conta');
  }
  const linked = await repos.patients.findByGuardian(account.guardianId);
  return linked.filter((patient) => patient.isActive);
}

/**
 * Responsável age em nome de um paciente: o escolhido (cookie), ou o único
 * representado. Cada resolução grava `read`/`guardian-access` ANTES de seguir
 * (write-ahead): sem trilha, o responsável não acessa nada. Ator = e-mail da
 * conta do responsável; titular = paciente (`patientId`).
 */
async function resolveGuardianPatient(
  repos: {
    userAccounts: UserAccountRepository;
    patients: PatientRepository;
    auditEvents: AuditEventRepository;
  },
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
  repos: {
    userAccounts: UserAccountRepository;
    patients: PatientRepository;
    auditEvents: AuditEventRepository;
  },
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
  return patient;
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
