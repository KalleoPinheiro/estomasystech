import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';

export const GUARDIAN_ACCESS_REVOCATION_RESOURCE = 'guardian-access-revocation';

/**
 * O paciente encerra sozinho, pelo portal, o acesso do responsável em nome
 * dele (ADR-028). Vale só para este paciente: a conta e o cadastro do
 * responsável seguem, e outros pacientes dele não são afetados. A trilha é
 * gravada ANTES (write-ahead): se falhar, nada muda. Sem responsável ligado,
 * ou com o acesso já encerrado, não há o que revogar (404).
 */
export async function revokeGuardianAccess(
  repos: { patients: PatientRepository; auditEvents: AuditEventRepository },
  patient: Patient,
  actor: { subject: string; clinicId: string | null },
): Promise<Patient> {
  if (!patient.guardianId || patient.guardianPortalRevokedAt) {
    throw new NotFoundError('Acesso do responsável', patient.id);
  }
  await repos.auditEvents.save(
    AuditEvent.create({
      clinicId: actor.clinicId,
      actorRole: 'patient',
      actorId: actor.subject,
      action: 'update',
      resourceType: GUARDIAN_ACCESS_REVOCATION_RESOURCE,
      resourceId: patient.id,
      patientId: patient.id,
      detail: 'paciente encerrou o acesso do responsável ao portal',
    }),
  );
  const revoked = patient.revokeGuardianPortalAccess();
  await repos.patients.save(revoked);
  return revoked;
}
