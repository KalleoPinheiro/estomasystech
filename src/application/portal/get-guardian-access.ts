import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { Patient } from '@/domain/patient/patient';
import { GUARDIAN_ACCESS_RESOURCE } from './portal-identity';

/** O que o paciente vê de quem pode acessar o portal em nome dele (ADR-027). */
export interface GuardianAccessView {
  fullName: string;
  relationshipLabel: string;
  /** Último acesso em nome do paciente, da trilha; `null` se nunca acessou. */
  lastAccessAt: Date | null;
}

/**
 * Evidência para o titular: o responsável ligado ao paciente que tem conta de
 * portal ativa, e quando foi o último acesso. Sem responsável, sem conta ou
 * com a conta desativada ou anonimizada, não há acesso a mostrar.
 */
export async function getGuardianAccess(
  repos: {
    guardians: GuardianRepository;
    userAccounts: UserAccountRepository;
    auditEvents: AuditEventRepository;
  },
  patient: Patient,
): Promise<GuardianAccessView | null> {
  if (!patient.guardianId || patient.guardianPortalRevokedAt) return null;
  const guardian = await repos.guardians.findById(patient.guardianId);
  const account = guardian
    ? await repos.userAccounts.findByPortalLink({ guardianId: guardian.id })
    : null;
  if (!guardian || !account?.isActive || account.isAnonymized) return null;
  const [last] = await repos.auditEvents.findAll(
    { patientId: patient.id, resourceType: GUARDIAN_ACCESS_RESOURCE },
    { limit: 1 },
  );
  return {
    fullName: guardian.fullName,
    relationshipLabel: guardian.relationshipLabel,
    lastAccessAt: last?.occurredAt ?? null,
  };
}
