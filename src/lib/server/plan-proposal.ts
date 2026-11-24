import 'server-only';
import type { TransactionScope } from '@/application/ports/transaction-manager';
import { AuditEvent } from '@/domain/audit/audit-event';
import {
  type PlanProposalInput,
  planProposalTerms,
  proposalValidUntil,
} from '@/domain/billing/plan-proposal';
import { isClinicInfoComplete } from '@/domain/clinic/clinic';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import { zonedParts } from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { writeClinicId, writeScope } from '@/lib/auth/tenant-scope';
import { renderPlanProposalPdf } from '@/lib/documents/plan-proposal-pdf';
import { prescriptionIssuer } from '@/lib/documents/prescription-pdf';
import { formatCivilDate, formatDateTime } from '@/lib/format';
import { clinicInfoFrom } from './data/clinic-info';

/**
 * Proposta do plano de acompanhamento (#964). Gerada na hora a partir do que a
 * equipe preencheu, do preço avulso do procedimento e da próxima consulta; o
 * texto não é guardado (decisão de 2026-11-24, reversível) e a emissão fica na
 * auditoria. Leva preço, então é do Admin, como a venda do plano (AD-027).
 */

export const PROPOSAL_CLINIC_INCOMPLETE_MESSAGE =
  'Complete os dados cadastrais (CNPJ ou CPF, responsável técnico e registro) em Configurações antes de gerar a proposta.';
export const PROPOSAL_ROLE_MESSAGE =
  'A proposta do plano é gerada só pelo Admin';

const RESOURCE_TYPE = 'proposta-plano';

export interface PlanProposalRequest extends PlanProposalInput {
  patientId: string;
  procedureId: string;
}

export interface PlanProposalPdf {
  bytes: Uint8Array;
  fileName: string;
}

function todayCivil(now: Date): string {
  const { year, month, day } = zonedParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function partiesOf(tx: TransactionScope, request: PlanProposalRequest) {
  const patient = await tx.patients.findById(request.patientId);
  if (!patient || patient.isAnonymized) {
    throw new NotFoundError('Paciente', request.patientId);
  }
  const procedure = await tx.procedures.findById(request.procedureId);
  if (!procedure) {
    throw new NotFoundError('Procedimento', request.procedureId);
  }
  return { patient, procedure };
}

/** Próxima consulta ativa que ainda não começou, se houver. */
async function nextAppointmentOf(
  tx: TransactionScope,
  patientId: string,
  now: Date,
) {
  const upcoming = (
    await tx.appointments.findByPatientId(patientId, { endsAfter: now })
  ).filter(
    (appointment) => appointment.isActive && appointment.slot.start >= now,
  );
  upcoming.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  return upcoming[0] ?? null;
}

export async function renderPlanProposalFor(
  session: Session,
  request: PlanProposalRequest,
): Promise<PlanProposalPdf> {
  if (session.role !== 'company_admin') {
    throw new ForbiddenError(PROPOSAL_ROLE_MESSAGE);
  }
  const terms = planProposalTerms(request);
  const clinicId = writeClinicId(session);
  const { transactions } = await getRepositories(writeScope(session));
  const now = new Date();

  const doc = await transactions.run(async (tx) => {
    const clinic = clinicInfoFrom(await tx.clinics.findById(clinicId));
    if (!isClinicInfoComplete(clinic)) {
      throw new ValidationError(PROPOSAL_CLINIC_INCOMPLETE_MESSAGE);
    }
    const { patient, procedure } = await partiesOf(tx, request);
    const next = await nextAppointmentOf(tx, patient.id, now);

    await tx.auditEvents.save(
      AuditEvent.create({
        clinicId,
        actorRole: session.role,
        actorId: session.subject,
        action: 'create',
        resourceType: RESOURCE_TYPE,
        resourceId: patient.id,
        patientId: patient.id,
        detail: 'emissão de documento',
      }),
    );

    const issuedOn = todayCivil(now);
    return {
      issuer: prescriptionIssuer(clinic),
      city: clinic.city,
      patientName: patient.fullName,
      procedureName: procedure.name,
      singlePriceCents: procedure.priceCents,
      terms,
      issuedOn: formatCivilDate(issuedOn),
      validUntil: formatCivilDate(proposalValidUntil(issuedOn)),
      reassessmentOn: terms.reassessmentOn
        ? formatCivilDate(terms.reassessmentOn)
        : null,
      nextAppointment: next
        ? formatDateTime(next.slot.start.toISOString())
        : null,
      signer: {
        name: clinic.professionalName as string,
        registry: clinic.professionalRegistry,
      },
    };
  });

  return {
    bytes: await renderPlanProposalPdf(doc),
    fileName: `proposta-plano-${todayCivil(now)}.pdf`,
  };
}
