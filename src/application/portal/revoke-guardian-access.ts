import type { EmailGateway } from '@/application/ports/email-gateway';
import { AuditEvent } from '@/domain/audit/audit-event';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import type { GuardianRepository } from '@/domain/guardian/guardian-repository';
import type { Patient } from '@/domain/patient/patient';
import type { PatientRepository } from '@/domain/patient/patient-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { logger } from '@/lib/observability/logger';
import { maskEmail } from '@/lib/redact';

export const GUARDIAN_ACCESS_REVOCATION_RESOURCE = 'guardian-access-revocation';
export const GUARDIAN_REVOCATION_NOTICE_RESOURCE =
  'guardian-access-revocation-notice';

export type GuardianRevocationNoticeOutcome = 'sent' | 'skipped' | 'failed';

const NOTICE_DETAIL: Record<GuardianRevocationNoticeOutcome, string> = {
  sent: 'aviso do encerramento enviado ao responsável por e-mail',
  skipped:
    'aviso do encerramento não enviado: responsável sem e-mail ou canal desativado',
  failed: 'aviso do encerramento não enviado: falha no envio',
};

/**
 * O paciente encerra sozinho, pelo portal, o acesso do responsável em nome
 * dele (ADR-028). Vale só para este paciente: a conta e o cadastro do
 * responsável seguem, e outros pacientes dele não são afetados. A trilha é
 * gravada ANTES (write-ahead): se falhar, nada muda. Sem responsável ligado,
 * ou com o acesso já encerrado, não há o que revogar (404).
 */
export async function revokeGuardianAccess(
  repos: {
    patients: PatientRepository;
    auditEvents: AuditEventRepository;
    guardians: GuardianRepository;
    email: EmailGateway;
  },
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
  await notifyGuardianOfRevocation(repos, patient, actor);
  return revoked;
}

/**
 * Avisa o responsável, por e-mail, que o acesso dele ao portal daquele
 * paciente foi encerrado. O texto nunca leva o motivo nem dado clínico, só o
 * nome do paciente que ele já conhece. Melhor esforço: a revogação já está
 * gravada, então falha (de envio ou de trilha) é registrada e não a desfaz
 * nem derruba a resposta. O endereço não vai para a trilha.
 */
async function notifyGuardianOfRevocation(
  repos: {
    auditEvents: AuditEventRepository;
    guardians: GuardianRepository;
    email: EmailGateway;
  },
  patient: Patient,
  actor: { subject: string; clinicId: string | null },
): Promise<void> {
  let outcome: GuardianRevocationNoticeOutcome = 'skipped';
  let recipient: string | null = null;
  try {
    const guardian = patient.guardianId
      ? await repos.guardians.findById(patient.guardianId)
      : null;
    recipient = guardian?.email ?? null;
    if (recipient && (await repos.email.isEnabled())) {
      await repos.email.send({
        to: recipient,
        subject: 'Vitta Flow: seu acesso ao portal foi encerrado',
        text:
          `Seu acesso ao portal em nome de ${patient.fullName} foi encerrado.\n\n` +
          'Você não verá mais esse paciente ao entrar. Os demais pacientes ' +
          'vinculados a você não foram afetados.\n\n' +
          'Em caso de dúvida, fale com a clínica.',
      });
      outcome = 'sent';
    }
  } catch {
    outcome = 'failed';
    logger.warn(
      `Aviso de encerramento do acesso do paciente ${patient.id} não enviado${recipient ? ` para ${maskEmail(recipient)}` : ''}`,
    );
  }
  try {
    await repos.auditEvents.save(
      AuditEvent.create({
        clinicId: actor.clinicId,
        actorRole: 'patient',
        actorId: actor.subject,
        action: 'update',
        resourceType: GUARDIAN_REVOCATION_NOTICE_RESOURCE,
        resourceId: patient.id,
        patientId: patient.id,
        detail: NOTICE_DETAIL[outcome],
      }),
    );
  } catch {
    logger.warn(
      `Trilha do aviso de encerramento do paciente ${patient.id} não gravada`,
    );
  }
}
