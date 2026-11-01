import 'server-only';
import { ResolveReceipt } from '@/application/billing/resolve-receipt';
import type { ReceiptParties } from '@/domain/billing/receipt';
import { ForbiddenError, NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { recordAudit } from '@/lib/audit';
import { assertClinicalResourceAccessible } from '@/lib/auth/clinical-resource-scope';
import type { Session } from '@/lib/auth/session';
import { sessionScope, writeClinicId } from '@/lib/auth/tenant-scope';
import {
  type AppointmentDto,
  type AssessmentDto,
  type ConditionDto,
  type InvoiceDto,
  type PatientDto,
  type PayoutReceiptDto,
  type ProfessionalDto,
  toAppointmentDto,
  toAssessmentDto,
  toCommissionPayoutDto,
  toConditionDto,
  toInvoiceDto,
  toProfessionalDto,
} from '@/lib/dto';
import { canRoleAccess } from '@/lib/staff-pages';
import { getPatientRecord } from './patient-record';

/**
 * Leituras dos documentos imprimíveis no servidor (#546, ADR-082). Cada função é
 * a mesma resposta da rota `GET /api/…` que a página chamava antes (e que, onde
 * a rota continua, passa a chamá-la): escopo de empresa por `sessionScope`, R4
 * do Profissional e a leitura do prontuário auditada.
 */

const FORBIDDEN_MESSAGE = 'Seu papel não tem acesso a este recurso';

export interface AttendanceDocumentData {
  appointment: AppointmentDto | null;
  /** Só para a data de nascimento; sem acesso ao paciente, a declaração sai sem ela. */
  patient: PatientDto | null;
}

/** Consulta da declaração de comparecimento; `appointment` nulo = não existe na empresa. */
export async function getAttendanceDocumentData(
  session: Session,
  appointmentId: string,
): Promise<AttendanceDocumentData> {
  const { appointments, patients } = await getRepositories(
    sessionScope(session),
  );
  const found = await appointments.findById(appointmentId);
  if (!found) return { appointment: null, patient: null };
  const owner = await patients.findById(found.patientId);
  const patient = await getPatientRecord(session, found.patientId).catch(
    () => null,
  );
  return { appointment: toAppointmentDto(found, owner?.fullName), patient };
}

/** Fatura do recibo (mesma resposta de `GET /api/invoices/[id]`). */
export async function getInvoiceDocumentData(
  session: Session,
  invoiceId: string,
): Promise<InvoiceDto> {
  const { invoices, patients } = await getRepositories(sessionScope(session));
  const invoice = await invoices.findById(invoiceId);
  if (!invoice) throw new NotFoundError('Fatura', invoiceId);
  const patient = await patients.findById(invoice.patientId);
  return toInvoiceDto(invoice, patient?.fullName);
}

/**
 * Pagador e prestador do recibo, com o CPF/CNPJ completos (#326, FIN-RN-15).
 * É o único ponto que devolve o CPF inteiro, e cada leitura é auditada (sem o
 * número no registro). Falta de CPF ou CNPJ lança `ValidationError` com a
 * orientação. Mesma resposta de `GET /api/invoices/[id]/payments/[paymentId]/receipt`.
 */
export async function getReceiptPartiesFor(
  session: Session,
  invoiceId: string,
  paymentId: string,
): Promise<ReceiptParties> {
  const { invoices, patients, clinics, auditEvents } = await getRepositories(
    sessionScope(session),
  );
  const parties = await new ResolveReceipt(invoices, patients, clinics).execute(
    {
      invoiceId,
      paymentId,
      clinicId: writeClinicId(session),
    },
  );
  const invoice = await invoices.findById(invoiceId);
  recordAudit(auditEvents, session, {
    action: 'read',
    resourceType: 'recibo',
    resourceId: paymentId,
    patientId: invoice?.patientId ?? null,
    detail: 'CPF no recibo',
  });
  return parties;
}

/**
 * Comprovante de repasse: o Admin emite qualquer um da clínica; o Profissional,
 * só o próprio (repasse de outro = 404, nem a existência é revelada). Mesma
 * resposta de `GET /api/commission-payouts/[id]` e `GET /api/my-payouts/[id]`.
 */
export async function getPayoutReceiptFor(
  session: Session,
  payoutId: string,
): Promise<PayoutReceiptDto> {
  const own = session.role === 'profissional';
  if (!own && !canRoleAccess('/api/commission-payouts', session.role)) {
    throw new ForbiddenError(FORBIDDEN_MESSAGE);
  }
  const { commissionPayouts, professionals } = await getRepositories(
    sessionScope(session),
  );
  const payout = await commissionPayouts.findById(payoutId);
  if (
    !payout ||
    (own &&
      (!session.professionalId ||
        payout.professionalId !== session.professionalId))
  ) {
    throw new NotFoundError('Repasse', payoutId);
  }
  const professional = await professionals.findById(payout.professionalId);
  const fullName = professional?.fullName ?? '—';
  return {
    payout: toCommissionPayoutDto(payout, fullName),
    professional: { fullName, registry: professional?.registry ?? null },
  };
}

/** Condição do relatório; nula = não existe na empresa. Mesma resposta de `GET /api/conditions/[id]`. */
export async function getConditionDocumentData(
  session: Session,
  conditionId: string,
): Promise<ConditionDto | null> {
  const repos = await getRepositories(sessionScope(session));
  await assertClinicalResourceAccessible(
    session,
    'condition',
    conditionId,
    repos,
  );
  const condition = await repos.conditions.findById(conditionId);
  if (!condition) return null;
  recordAudit(repos.auditEvents, session, {
    action: 'read',
    resourceType: 'condition',
    resourceId: condition.id,
    patientId: condition.patientId,
  });
  return toConditionDto(condition);
}

/** Avaliações da condição. Mesma resposta de `GET /api/conditions/[id]/assessments`. */
export async function listConditionAssessmentsFor(
  session: Session,
  conditionId: string,
): Promise<AssessmentDto[]> {
  const repos = await getRepositories(sessionScope(session));
  await assertClinicalResourceAccessible(
    session,
    'condition',
    conditionId,
    repos,
  );
  const [result, condition] = await Promise.all([
    repos.assessments.findByConditionId(conditionId),
    repos.conditions.findById(conditionId),
  ]);
  recordAudit(repos.auditEvents, session, {
    action: 'read',
    resourceType: 'assessments',
    resourceId: conditionId,
    patientId: condition?.patientId ?? null,
  });
  return result.map(toAssessmentDto);
}

/**
 * Profissional que prescreveu o plano de cuidados: assina o documento no lugar
 * da assinatura genérica da clínica (#94, DOC-11). Nulo quando não existe na
 * empresa (o documento volta à assinatura da clínica).
 */
export async function getPrescribingProfessionalFor(
  session: Session,
  professionalId: string,
): Promise<ProfessionalDto | null> {
  const { professionals } = await getRepositories(sessionScope(session));
  const professional = await professionals.findById(professionalId);
  return professional ? toProfessionalDto(professional) : null;
}
