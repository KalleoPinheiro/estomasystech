import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';

/** O que o portal sabe de quem está logado: o e-mail de login e o papel. */
export interface PortalSessionIdentity {
  subject: string;
  role: UserRole;
}

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

export async function resolvePortalPatient(
  repos: { userAccounts: UserAccountRepository; patients: PatientRepository },
  session: PortalSessionIdentity,
): Promise<Patient> {
  const account = await linkedAccount(repos.userAccounts, session);
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
