import 'server-only';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { recordAudit } from '@/lib/audit';
import type { PatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import type { PrescriptionSummaryDto } from '@/lib/dto';
import {
  type PrescriptionPdf,
  prescriptionPdf,
  toPrescriptionSummary,
} from './prescription';

/**
 * Receituário no portal (#956, ADR-116): o paciente (ou o responsável que o
 * representa, POR-RN-21) vê e baixa os receituários emitidos para ele, exatamente como
 * emitidos. Só pelo portal, sem e-mail. O anonimizado pela retenção não aparece.
 */

/** Emitidos para o titular da sessão, do mais novo para o mais antigo. */
export async function listPortalPrescriptions(
  session: PatientPortalSession,
): Promise<PrescriptionSummaryDto[]> {
  const services = await getRepositories(sessionScope(session));
  const patient = await resolvePortalPatient(services, session);
  const prescriptions = await services.nursingPrescriptions.findByPatientId(
    patient.id,
  );
  return prescriptions
    .filter((prescription) => prescription.content !== null)
    .map(toPrescriptionSummary);
}

/** PDF de um receituário do titular; leitura auditada, como a foto no portal. */
export async function renderPortalPrescription(
  session: PatientPortalSession,
  prescriptionId: string,
): Promise<PrescriptionPdf> {
  const services = await getRepositories(sessionScope(session));
  const patient = await resolvePortalPatient(services, session);
  const prescription =
    await services.nursingPrescriptions.findById(prescriptionId);
  // De outro paciente ou sem conteúdo: o mesmo 404, sem dizer qual.
  if (prescription?.patientId !== patient.id || !prescription.content) {
    throw new NotFoundError('Receituário', prescriptionId);
  }
  recordAudit(services.auditEvents, session, {
    action: 'read',
    resourceType: 'receituario',
    resourceId: prescription.id,
    patientId: patient.id,
  });
  return prescriptionPdf(prescription.content, prescription);
}
