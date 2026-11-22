import 'server-only';
import { AuditEvent } from '@/domain/audit/audit-event';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import {
  EMPTY_PRESCRIPTION_MESSAGE,
  NursingPrescription,
  type PrescriptionContent,
} from '@/domain/clinical/nursing-prescription';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import {
  sessionScope,
  writeClinicId,
  writeScope,
} from '@/lib/auth/tenant-scope';
import {
  prescriptionIssuer,
  renderPrescriptionPdf,
} from '@/lib/documents/prescription-pdf';
import type {
  CarePlanDetailDto,
  ClinicInfoDto,
  PrescriptionSummaryDto,
} from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { getCarePlanDetailFor } from './data/care-plan';
import { getClinicInfoFor } from './data/clinic-info';
import { getPrescribingProfessionalFor } from './data/documents';
import { getPatientRecord } from './data/patient-record';

/**
 * Receituário de enfermagem (#956, ADR-116). Emitir grava o conteúdo impresso
 * (timbre, paciente, intervenções NIC com frequência, observações e
 * prescritora) com o número `RCT-`; baixar de novo reproduz exatamente o
 * emitido. Se o plano mudar, a próxima emissão ganha outro número. Nada mais do
 * prontuário entra: sem diagnóstico, avaliação nem foto. Leitura no escopo da
 * empresa e com R4 do Profissional; a emissão é o evento de auditoria `create`.
 */

export { EMPTY_PRESCRIPTION_MESSAGE };

export const CLINIC_INCOMPLETE_MESSAGE =
  'Complete os dados cadastrais (CNPJ ou CPF, responsável técnico e registro) em Configurações antes de emitir o receituário.';
export const RECEITUARIO_ROLE_MESSAGE =
  'Receituário é emitido só por Admin ou Profissional';
export const ANONYMIZED_PRESCRIPTION_MESSAGE =
  'O conteúdo deste receituário foi removido pela retenção de dados.';

/** Trava e trilha: o tipo de documento é o mesmo das outras emissões (ADR-082). */
const RESOURCE_TYPE = 'receituario';

export interface PrescriptionPdf {
  bytes: Uint8Array;
  fileName: string;
}

export const toPrescriptionSummary = (
  prescription: NursingPrescription,
): PrescriptionSummaryDto => ({
  id: prescription.id,
  documentNumber: prescription.documentNumber,
  issuedAt: prescription.issuedAt.toISOString(),
});

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
): Promise<PrescriptionContent['signer']> {
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

/** Monta, do plano como está agora, o que vai ser impresso. */
async function currentContent(
  session: Session,
  carePlanId: string,
  freeText: string | null,
): Promise<{ patientId: string; content: PrescriptionContent }> {
  const detail = await getCarePlanDetailFor(session, carePlanId);
  const clinic = await getClinicInfoFor(session);
  assertPrintable(clinic, detail);
  const [patient, signer] = await Promise.all([
    getPatientRecord(session, detail.plan.patientId),
    signerFor(session, clinic, detail.plan.professionalId),
  ]);
  return {
    patientId: detail.plan.patientId,
    content: {
      issuer: prescriptionIssuer(clinic),
      city: clinic.city,
      patientName: patient.fullName,
      items: detail.interventions.map((intervention) => ({
        label: intervention.interventionLabel,
        frequency: intervention.frequency,
      })),
      freeText,
      signer,
    },
  };
}

/**
 * Emite o receituário. Clicar de novo sem mudar nada devolve o último emitido
 * (mesmo número); a trava por plano impede que duas abas gerem dois números.
 */
export async function issuePrescriptionFor(
  session: Session,
  carePlanId: string,
  freeText: string | null,
): Promise<PrescriptionSummaryDto> {
  // Ato clínico: o Atendente não emite (a família clínica já o barra na rota).
  if (session.role === 'atendente') {
    throw new ForbiddenError(RECEITUARIO_ROLE_MESSAGE);
  }
  const { patientId, content } = await currentContent(
    session,
    carePlanId,
    freeText,
  );
  const clinicId = writeClinicId(session);
  const { transactions } = await getRepositories(writeScope(session));
  return transactions.run(async (tx) => {
    await tx.auditEvents.lockResource(RESOURCE_TYPE, carePlanId);
    // Trava a linha do paciente: a anonimização da retenção espera ou já
    // passou. Anonimizado no meio do caminho não grava o nome lido antes.
    const holder = await tx.patients.findByIdForUpdate(patientId);
    if (holder?.isAnonymized !== false) {
      throw new NotFoundError('Paciente', patientId);
    }
    const [latest] = await tx.nursingPrescriptions.findByCarePlanId(carePlanId);
    if (latest?.hasSameContent(content)) return toPrescriptionSummary(latest);

    const prescription = NursingPrescription.create({
      carePlanId,
      patientId,
      issuedBy: session.subject,
      content,
    });
    await tx.nursingPrescriptions.save(prescription);
    await tx.auditEvents.save(
      AuditEvent.create({
        clinicId,
        actorRole: session.role,
        actorId: session.subject,
        action: 'create',
        resourceType: RESOURCE_TYPE,
        resourceId: prescription.id,
        patientId,
        detail: 'emissão de documento',
      }),
    );
    return toPrescriptionSummary(prescription);
  });
}

/** Receituários já emitidos do plano, do mais novo para o mais antigo. */
export async function listPrescriptionsFor(
  session: Session,
  carePlanId: string,
): Promise<PrescriptionSummaryDto[]> {
  const repos = await getRepositories(sessionScope(session));
  await assertClinicalResourceAccessible(
    session,
    'carePlan',
    carePlanId,
    repos,
  );
  // Plano de outra empresa = 404, como na emissão (não uma lista vazia).
  if (!(await repos.carePlans.findById(carePlanId))) {
    throw new NotFoundError('Plano de cuidados', carePlanId);
  }
  const prescriptions =
    await repos.nursingPrescriptions.findByCarePlanId(carePlanId);
  return prescriptions.map(toPrescriptionSummary);
}

/** PDF de um receituário emitido, desenhado do conteúdo gravado na emissão. */
export async function renderPrescriptionFor(
  session: Session,
  carePlanId: string,
  prescriptionId: string,
): Promise<PrescriptionPdf> {
  const repos = await getRepositories(sessionScope(session));
  await assertClinicalResourceAccessible(
    session,
    'carePlan',
    carePlanId,
    repos,
  );
  const prescription =
    await repos.nursingPrescriptions.findById(prescriptionId);
  if (!prescription || prescription.carePlanId !== carePlanId) {
    throw new NotFoundError('Receituário', prescriptionId);
  }
  if (!prescription.content) {
    throw new ValidationError(ANONYMIZED_PRESCRIPTION_MESSAGE);
  }
  return prescriptionPdf(prescription.content, prescription);
}

/** Desenha o PDF do conteúdo gravado na emissão: nunca do plano atual. */
export async function prescriptionPdf(
  content: PrescriptionContent,
  prescription: NursingPrescription,
): Promise<PrescriptionPdf> {
  const bytes = await renderPrescriptionPdf({
    ...content,
    issuedOn: formatDate(prescription.issuedAt.toISOString()),
    documentNumber: prescription.documentNumber,
  });
  return { bytes, fileName: `receituario-${prescription.documentNumber}.pdf` };
}
