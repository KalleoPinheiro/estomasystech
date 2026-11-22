import 'server-only';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import { ValidationError } from '@/domain/shared/errors';
import type { Session } from '@/lib/auth/session';
import {
  type PrescriptionDocument,
  prescriptionIssuer,
  renderPrescriptionPdf,
} from '@/lib/documents/prescription-pdf';
import type { CarePlanDetailDto, ClinicInfoDto } from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { getCarePlanDetailFor } from './data/care-plan';
import { getClinicInfoFor } from './data/clinic-info';
import { getPrescribingProfessionalFor } from './data/documents';
import { getPatientRecord } from './data/patient-record';
import { issueDocumentFor } from './document-issuance';

/**
 * Receituário de enfermagem (#956): gerado do plano de cuidados (SAE), com os
 * itens prescritos (intervenções NIC e frequência) e nada mais do prontuário —
 * sem diagnóstico, avaliação nem foto. Leitura no escopo da empresa e com R4
 * do Profissional (`getCarePlanDetailFor`); a emissão é o evento de auditoria
 * `create` (ADR-082), idempotente: baixar de novo devolve o mesmo número e data.
 */

export const CLINIC_INCOMPLETE_MESSAGE =
  'Complete os dados cadastrais (CNPJ ou CPF, responsável técnico e registro) em Configurações antes de emitir o receituário.';
export const EMPTY_PRESCRIPTION_MESSAGE =
  'Este plano de cuidados ainda não tem intervenção prescrita: não é possível emitir o receituário vazio.';

export interface PrescriptionPdf {
  bytes: Uint8Array;
  fileName: string;
}

function assertPrintable(
  clinic: ClinicInfoDto,
  detail: CarePlanDetailDto,
): void {
  if (!isClinicInfoComplete(clinic)) {
    throw new ValidationError(CLINIC_INCOMPLETE_MESSAGE);
  }
  if (detail.interventions.length === 0) {
    throw new ValidationError(EMPTY_PRESCRIPTION_MESSAGE);
  }
}

async function signerFor(
  session: Session,
  clinic: ClinicInfoDto,
  professionalId: string | null,
): Promise<PrescriptionDocument['signer']> {
  // Assina quem prescreveu o plano; sem ele, o responsável técnico (#94, DOC-11).
  const professional = professionalId
    ? await getPrescribingProfessionalFor(session, professionalId)
    : null;
  if (professional) {
    return { name: professional.fullName, registry: professional.registry };
  }
  return {
    name: clinic.professionalName as string,
    registry: clinic.professionalRegistry,
  };
}

export async function buildPrescriptionPdfFor(
  session: Session,
  carePlanId: string,
): Promise<PrescriptionPdf> {
  const detail = await getCarePlanDetailFor(session, carePlanId);
  const clinic = await getClinicInfoFor(session);
  assertPrintable(clinic, detail);
  const [patient, signer] = await Promise.all([
    getPatientRecord(session, detail.plan.patientId),
    signerFor(session, clinic, detail.plan.professionalId),
  ]);
  const issuance = await issueDocumentFor(session, {
    documentType: 'receituario',
    resourceId: carePlanId,
  });

  const bytes = await renderPrescriptionPdf({
    issuer: prescriptionIssuer(clinic),
    patientName: patient.fullName,
    items: detail.interventions.map((intervention) => ({
      label: intervention.interventionLabel,
      frequency: intervention.frequency,
    })),
    issuedOn: formatDate(issuance.issuedAt),
    city: clinic.city,
    documentNumber: issuance.documentNumber,
    signer,
  });
  return { bytes, fileName: `receituario-${issuance.documentNumber}.pdf` };
}
