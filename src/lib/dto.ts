import type { CarePlanDetail } from '@/application/clinical/get-care-plan';
import type { AuditEvent } from '@/domain/audit/audit-event';
import type { UserAccount } from '@/domain/auth/user-account';
import type { Invoice } from '@/domain/billing/invoice';
import type { Procedure as CatalogProcedure } from '@/domain/catalog/procedure';
import type { Clinic } from '@/domain/clinic/clinic';
import type { Anamnesis } from '@/domain/clinical/anamnesis';
import type { CarePlan, CarePlanStatus } from '@/domain/clinical/care-plan';
import type {
  CarePlanDiagnosis,
  CarePlanDiagnosisType,
} from '@/domain/clinical/care-plan-diagnosis';
import type {
  CarePlanIntervention,
  InterventionPriority,
} from '@/domain/clinical/care-plan-intervention';
import type { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import type { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import type { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import type { ConditionPhoto } from '@/domain/clinical/condition-photo';
import type { EvolutionNote } from '@/domain/clinical/evolution-note';
import type { InterventionRecord } from '@/domain/clinical/intervention-record';
import type { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import type { FollowUp } from '@/domain/followup/follow-up';
import type { StockMovement } from '@/domain/inventory/stock-movement';
import type { Supply } from '@/domain/inventory/supply';
import type { Partner } from '@/domain/partner/partner';
import type { Patient } from '@/domain/patient/patient';
import type { Professional } from '@/domain/professional/professional';
import type { Appointment } from '@/domain/scheduling/appointment';
import type { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import type { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import type { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

export interface PatientDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  birthDate: string | null;
  notes: string | null;
  referredByPartnerId: string | null;
  active: boolean;
  createdAt: string;
}

export const toPatientDto = (patient: Patient): PatientDto => ({
  id: patient.id,
  fullName: patient.fullName,
  email: patient.email,
  phone: patient.phone,
  birthDate: patient.birthDate?.toISOString() ?? null,
  notes: patient.notes,
  referredByPartnerId: patient.referredByPartnerId,
  active: patient.isActive,
  createdAt: patient.createdAt.toISOString(),
});

/**
 * DTOs de portal — minimização de dados (LGPD art. 6º, III):
 * cada papel recebe apenas o estritamente necessário à sua finalidade.
 */

/** Consulta vista pelos portais: sem preço e sem anotações internas da equipe. */
export interface PortalAppointmentDto {
  id: string;
  startsAt: string;
  endsAt: string;
  procedure: string;
  status: string;
}

export const toPortalAppointmentDto = (
  appointment: Appointment,
): PortalAppointmentDto => ({
  id: appointment.id,
  startsAt: appointment.slot.start.toISOString(),
  endsAt: appointment.slot.end.toISOString(),
  procedure: appointment.procedure,
  status: appointment.status,
});

/** Perfil do paciente no próprio portal: sem observações internas da equipe. */
export interface PortalPatientProfileDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

export const toPortalPatientProfileDto = (
  patient: Patient,
): PortalPatientProfileDto => ({
  id: patient.id,
  fullName: patient.fullName,
  email: patient.email,
  phone: patient.phone,
});

/** Paciente visto pelo parceiro: apenas identificação nominal da indicação. */
export interface ReferredPatientSummaryDto {
  id: string;
  fullName: string;
}

export const toReferredPatientSummaryDto = (
  patient: Patient,
): ReferredPatientSummaryDto => ({
  id: patient.id,
  fullName: patient.fullName,
});

export interface PartnerDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  crm: string | null;
  specialty: string | null;
  active: boolean;
}

export const toPartnerDto = (partner: Partner): PartnerDto => ({
  id: partner.id,
  fullName: partner.fullName,
  email: partner.email,
  phone: partner.phone,
  crm: partner.crm,
  specialty: partner.specialty,
  active: partner.isActive,
});

export interface AppointmentDto {
  id: string;
  patientId: string;
  patientName?: string;
  startsAt: string;
  endsAt: string;
  procedure: string;
  priceCents: number;
  notes: string | null;
  status: string;
  professionalId: string | null;
}

export const toAppointmentDto = (
  appointment: Appointment,
  patientName?: string,
): AppointmentDto => ({
  id: appointment.id,
  patientId: appointment.patientId,
  patientName,
  startsAt: appointment.slot.start.toISOString(),
  endsAt: appointment.slot.end.toISOString(),
  procedure: appointment.procedure,
  priceCents: appointment.price.cents,
  notes: appointment.notes,
  status: appointment.status,
  professionalId: appointment.professionalId,
});

export interface InvoiceDto {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId: string | null;
  description: string;
  amountCents: number;
  status: string;
  issuedAt: string;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
}

export interface AnamnesisDto {
  patientId: string;
  comorbidities: string;
  allergies: string;
  medications: string;
  surgicalHistory: string;
  notes: string;
  updatedAt: string;
}

export const toAnamnesisDto = (anamnesis: Anamnesis): AnamnesisDto => ({
  patientId: anamnesis.patientId,
  comorbidities: anamnesis.comorbidities,
  allergies: anamnesis.allergies,
  medications: anamnesis.medications,
  surgicalHistory: anamnesis.surgicalHistory,
  notes: anamnesis.notes,
  updatedAt: anamnesis.updatedAt.toISOString(),
});

export interface EvolutionNoteDto {
  id: string;
  patientId: string;
  appointmentId: string | null;
  professionalId: string | null;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  createdAt: string;
}

export const toEvolutionNoteDto = (note: EvolutionNote): EvolutionNoteDto => ({
  id: note.id,
  patientId: note.patientId,
  appointmentId: note.appointmentId,
  professionalId: note.professionalId,
  subjective: note.subjective,
  objective: note.objective,
  assessment: note.assessment,
  plan: note.plan,
  createdAt: note.createdAt.toISOString(),
});

export interface ConditionDto {
  id: string;
  patientId: string;
  kind: string;
  title: string;
  stomaType: string | null;
  startedAt: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

export const toConditionDto = (condition: ClinicalCondition): ConditionDto => ({
  id: condition.id,
  patientId: condition.patientId,
  kind: condition.kind,
  title: condition.title,
  stomaType: condition.stomaType,
  startedAt: condition.startedAt?.toISOString() ?? null,
  notes: condition.notes,
  status: condition.status,
  createdAt: condition.createdAt.toISOString(),
});

/**
 * DTO allowlist do portal (#69) — sem `notes` (nota interna da equipe).
 * Tipo próprio (não `Omit<ConditionDto, "notes">`) para que um campo novo no
 * domínio não vaze automaticamente: cada campo exposto é citado aqui.
 */
export interface PortalConditionDto {
  id: string;
  patientId: string;
  kind: string;
  title: string;
  stomaType: string | null;
  startedAt: string | null;
  status: string;
  createdAt: string;
}

export const toPortalConditionDto = (
  condition: ClinicalCondition,
): PortalConditionDto => ({
  id: condition.id,
  patientId: condition.patientId,
  kind: condition.kind,
  title: condition.title,
  stomaType: condition.stomaType,
  startedAt: condition.startedAt?.toISOString() ?? null,
  status: condition.status,
  createdAt: condition.createdAt.toISOString(),
});

export interface AssessmentDto {
  id: string;
  conditionId: string;
  lengthMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  areaMm2: number | null;
  tissueType: string | null;
  exudate: string | null;
  painScale: number | null;
  skinCondition: string | null;
  complications: string | null;
  complicationCodes: string[];
  detScore: number | null;
  pushScore: number | null;
  notes: string | null;
  createdAt: string;
}

export const toAssessmentDto = (
  assessment: ConditionAssessment,
): AssessmentDto => ({
  id: assessment.id,
  conditionId: assessment.conditionId,
  lengthMm: assessment.lengthMm,
  widthMm: assessment.widthMm,
  depthMm: assessment.depthMm,
  areaMm2: assessment.areaMm2,
  tissueType: assessment.tissueType,
  exudate: assessment.exudate,
  painScale: assessment.painScale,
  skinCondition: assessment.skinCondition,
  complications: assessment.complications,
  complicationCodes: assessment.complicationCodes,
  detScore: assessment.detScore,
  pushScore: assessment.pushScore,
  notes: assessment.notes,
  createdAt: assessment.createdAt.toISOString(),
});

/**
 * DTO allowlist do portal (#69, #93) — sem `notes` nem `complications` (texto
 * livre escrito por um profissional pra outro, não pra leitura do paciente/
 * parceiro — achado P0 real de #93, `complicationCodes` codificado continua
 * disponível pra quem quiser status estruturado). Tipo próprio para que um
 * campo novo no domínio não vaze automaticamente.
 */
export interface PortalAssessmentDto {
  id: string;
  conditionId: string;
  lengthMm: number | null;
  widthMm: number | null;
  depthMm: number | null;
  areaMm2: number | null;
  tissueType: string | null;
  exudate: string | null;
  painScale: number | null;
  skinCondition: string | null;
  complicationCodes: string[];
  detScore: number | null;
  pushScore: number | null;
  createdAt: string;
}

export const toPortalAssessmentDto = (
  assessment: ConditionAssessment,
): PortalAssessmentDto => ({
  id: assessment.id,
  conditionId: assessment.conditionId,
  lengthMm: assessment.lengthMm,
  widthMm: assessment.widthMm,
  depthMm: assessment.depthMm,
  areaMm2: assessment.areaMm2,
  tissueType: assessment.tissueType,
  exudate: assessment.exudate,
  painScale: assessment.painScale,
  skinCondition: assessment.skinCondition,
  complicationCodes: assessment.complicationCodes,
  detScore: assessment.detScore,
  pushScore: assessment.pushScore,
  createdAt: assessment.createdAt.toISOString(),
});

export interface NursingDiagnosisDto {
  code: string;
  label: string;
  domain: string;
  class: string;
  definition: string | null;
  edition: string;
}

export const toNursingDiagnosisDto = (
  diagnosis: NursingDiagnosis,
): NursingDiagnosisDto => ({
  code: diagnosis.code,
  label: diagnosis.label,
  domain: diagnosis.domain,
  class: diagnosis.class,
  definition: diagnosis.definition,
  edition: diagnosis.edition,
});

export interface NursingOutcomeDto {
  code: string;
  label: string;
  domain: string;
  class: string;
  edition: string;
  /** Rótulos da escala 1–5, índice 0 = pontuação 1. */
  scaleAnchors: string[];
}

export const toNursingOutcomeDto = (
  outcome: NursingOutcome,
): NursingOutcomeDto => ({
  code: outcome.code,
  label: outcome.label,
  domain: outcome.domain,
  class: outcome.class,
  edition: outcome.edition,
  scaleAnchors: [...outcome.scale.anchors],
});

export interface NursingInterventionDto {
  code: string;
  label: string;
  domain: string;
  class: string;
  edition: string;
}

export const toNursingInterventionDto = (
  intervention: NursingIntervention,
): NursingInterventionDto => ({
  code: intervention.code,
  label: intervention.label,
  domain: intervention.domain,
  class: intervention.class,
  edition: intervention.edition,
});

export interface CarePlanDto {
  id: string;
  patientId: string;
  conditionId: string | null;
  professionalId: string | null;
  status: CarePlanStatus;
  createdAt: string;
}

export const toCarePlanDto = (plan: CarePlan): CarePlanDto => ({
  id: plan.id,
  patientId: plan.patientId,
  conditionId: plan.conditionId,
  professionalId: plan.professionalId,
  status: plan.status,
  createdAt: plan.createdAt.toISOString(),
});

export interface CarePlanDiagnosisDto {
  id: string;
  carePlanId: string;
  diagnosisCode: string;
  diagnosisLabel: string;
  type: CarePlanDiagnosisType;
  relatedFactors: string | null;
  definingCharacteristics: string | null;
  createdAt: string;
}

export const toCarePlanDiagnosisDto = (
  diagnosis: CarePlanDiagnosis,
  diagnosisLabel: string,
): CarePlanDiagnosisDto => ({
  id: diagnosis.id,
  carePlanId: diagnosis.carePlanId,
  diagnosisCode: diagnosis.diagnosisCode,
  diagnosisLabel,
  type: diagnosis.type,
  relatedFactors: diagnosis.relatedFactors,
  definingCharacteristics: diagnosis.definingCharacteristics,
  createdAt: diagnosis.createdAt.toISOString(),
});

export interface OutcomeEvaluationDto {
  id: string;
  outcomeId: string;
  score: number;
  professionalId: string | null;
  notes: string | null;
  evaluatedAt: string;
}

export const toOutcomeEvaluationDto = (
  evaluation: OutcomeEvaluation,
): OutcomeEvaluationDto => ({
  id: evaluation.id,
  outcomeId: evaluation.outcomeId,
  score: evaluation.score,
  professionalId: evaluation.professionalId,
  notes: evaluation.notes,
  evaluatedAt: evaluation.evaluatedAt.toISOString(),
});

export interface CarePlanOutcomeDto {
  id: string;
  carePlanId: string;
  outcomeCode: string;
  outcomeLabel: string;
  /** Rótulos da escala 1–5 do resultado — índice 0 = pontuação 1. */
  scaleAnchors: string[];
  baselineScore: number;
  targetScore: number;
  deadline: string | null;
  createdAt: string;
  /** Derivados a partir do histórico — null enquanto não houver avaliação. */
  currentScore: number | null;
  attainment: number | null;
  isAchieved: boolean | null;
  evaluations: OutcomeEvaluationDto[];
}

export const toCarePlanOutcomeDto = (
  outcome: CarePlanOutcome,
  evaluations: OutcomeEvaluation[],
  catalogOutcome?: NursingOutcome | null,
): CarePlanOutcomeDto => ({
  id: outcome.id,
  carePlanId: outcome.carePlanId,
  outcomeCode: outcome.outcomeCode,
  outcomeLabel: catalogOutcome?.label ?? outcome.outcomeCode,
  scaleAnchors: catalogOutcome ? [...catalogOutcome.scale.anchors] : [],
  baselineScore: outcome.baselineScore,
  targetScore: outcome.targetScore,
  deadline: outcome.deadline?.toISOString() ?? null,
  createdAt: outcome.createdAt.toISOString(),
  currentScore: outcome.currentScore(evaluations),
  attainment: outcome.attainment(evaluations),
  isAchieved: outcome.isAchieved(evaluations),
  evaluations: evaluations.map(toOutcomeEvaluationDto),
});

export interface InterventionRecordDto {
  id: string;
  interventionId: string;
  professionalId: string | null;
  notes: string | null;
  performedAt: string;
}

export const toInterventionRecordDto = (
  record: InterventionRecord,
): InterventionRecordDto => ({
  id: record.id,
  interventionId: record.interventionId,
  professionalId: record.professionalId,
  notes: record.notes,
  performedAt: record.performedAt.toISOString(),
});

export interface CarePlanInterventionDto {
  id: string;
  carePlanId: string;
  interventionCode: string;
  interventionLabel: string;
  frequency: string;
  priority: InterventionPriority;
  createdAt: string;
  records: InterventionRecordDto[];
}

export const toCarePlanInterventionDto = (
  intervention: CarePlanIntervention,
  records: InterventionRecord[],
  interventionLabel: string,
): CarePlanInterventionDto => ({
  id: intervention.id,
  carePlanId: intervention.carePlanId,
  interventionCode: intervention.interventionCode,
  interventionLabel,
  frequency: intervention.frequency,
  priority: intervention.priority,
  createdAt: intervention.createdAt.toISOString(),
  records: records.map(toInterventionRecordDto),
});

export interface CarePlanDetailDto {
  plan: CarePlanDto;
  diagnoses: CarePlanDiagnosisDto[];
  outcomes: CarePlanOutcomeDto[];
  interventions: CarePlanInterventionDto[];
}

export interface CarePlanCatalogLookup {
  diagnoses: Map<string, NursingDiagnosis>;
  outcomes: Map<string, NursingOutcome>;
  interventions: Map<string, NursingIntervention>;
}

export const toCarePlanDetailDto = (
  detail: CarePlanDetail,
  catalog: CarePlanCatalogLookup,
): CarePlanDetailDto => ({
  plan: toCarePlanDto(detail.plan),
  diagnoses: detail.diagnoses.map((diagnosis) =>
    toCarePlanDiagnosisDto(
      diagnosis,
      catalog.diagnoses.get(diagnosis.diagnosisCode)?.label ??
        diagnosis.diagnosisCode,
    ),
  ),
  outcomes: detail.outcomes.map(({ outcome, evaluations }) =>
    toCarePlanOutcomeDto(
      outcome,
      evaluations,
      catalog.outcomes.get(outcome.outcomeCode),
    ),
  ),
  interventions: detail.interventions.map(({ intervention, records }) =>
    toCarePlanInterventionDto(
      intervention,
      records,
      catalog.interventions.get(intervention.interventionCode)?.label ??
        intervention.interventionCode,
    ),
  ),
});

export interface SupplyDto {
  id: string;
  name: string;
  unit: string;
  minQty: number;
  priceCents: number;
  stockQty: number;
  isLowStock: boolean;
  /** Zero é mais grave que "baixo" — severidade visual escala (MAT-01/02). */
  isOutOfStock: boolean;
  active: boolean;
}

export const toSupplyDto = (supply: Supply): SupplyDto => ({
  id: supply.id,
  name: supply.name,
  unit: supply.unit,
  minQty: supply.minQty,
  priceCents: supply.priceCents,
  stockQty: supply.stockQty,
  isLowStock: supply.isLowStock,
  isOutOfStock: supply.isOutOfStock,
  active: supply.isActive,
});

export interface StockMovementDto {
  id: string;
  supplyId: string;
  type: string;
  quantity: number;
  reason: string;
  appointmentId: string | null;
  unitPriceCents: number | null;
  createdAt: string;
}

export const toStockMovementDto = (
  movement: StockMovement,
): StockMovementDto => ({
  id: movement.id,
  supplyId: movement.supplyId,
  type: movement.type,
  quantity: movement.quantity,
  reason: movement.reason,
  appointmentId: movement.appointmentId,
  unitPriceCents: movement.unitPriceCents,
  createdAt: movement.createdAt.toISOString(),
});

export interface FollowUpDto {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId: string | null;
  dueDate: string;
  reason: string;
  status: string;
  isOverdue?: boolean;
}

export const toFollowUpDto = (
  followUp: FollowUp,
  patientName?: string,
  isOverdue?: boolean,
): FollowUpDto => ({
  id: followUp.id,
  patientId: followUp.patientId,
  patientName,
  appointmentId: followUp.appointmentId,
  dueDate: followUp.dueDate.toISOString(),
  reason: followUp.reason,
  status: followUp.status,
  isOverdue,
});

export const toInvoiceDto = (
  invoice: Invoice,
  patientName?: string,
): InvoiceDto => ({
  id: invoice.id,
  patientId: invoice.patientId,
  patientName,
  appointmentId: invoice.appointmentId,
  description: invoice.description,
  amountCents: invoice.amount.cents,
  status: invoice.status,
  issuedAt: invoice.issuedAt.toISOString(),
  dueDate: invoice.dueDate?.toISOString() ?? null,
  paidAt: invoice.paidAt?.toISOString() ?? null,
  paymentMethod: invoice.paymentMethod,
});

export interface AuditEventDto {
  id: string;
  actorRole: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  patientId: string | null;
  detail: string | null;
  occurredAt: string;
}

export const toAuditEventDto = (event: AuditEvent): AuditEventDto => ({
  id: event.id,
  actorRole: event.actorRole,
  actorId: event.actorId,
  action: event.action,
  resourceType: event.resourceType,
  resourceId: event.resourceId,
  patientId: event.patientId,
  detail: event.detail,
  occurredAt: event.occurredAt.toISOString(),
});

export interface ConditionPhotoDto {
  id: string;
  conditionId: string;
  assessmentId: string | null;
  contentType: string;
  sizeBytes: number;
  origin: string;
  patientNote: string | null;
  triageStatus: string | null;
  createdAt: string;
}

export const toConditionPhotoDto = (
  photo: ConditionPhoto,
): ConditionPhotoDto => ({
  id: photo.id,
  conditionId: photo.conditionId,
  assessmentId: photo.assessmentId,
  contentType: photo.contentType,
  sizeBytes: photo.sizeBytes,
  origin: photo.origin,
  patientNote: photo.patientNote,
  triageStatus: photo.triageStatus,
  createdAt: photo.createdAt.toISOString(),
});

/** Item da fila de triagem (`GET /api/photos/triage`) — foto de paciente aguardando revisão do staff. */
export interface TriagePhotoDto {
  id: string;
  conditionTitle: string;
  patientId: string | null;
  patientName: string;
  patientNote: string | null;
  createdAt: string;
  waitingHours: number;
  latestScore: { kind: 'push' | 'det'; value: number } | null;
}

export interface ProfessionalDto {
  id: string;
  fullName: string;
  registry: string | null;
  commissionPct: number | null;
  active: boolean;
}

export const toProfessionalDto = (
  professional: Professional,
): ProfessionalDto => ({
  id: professional.id,
  fullName: professional.fullName,
  registry: professional.registry,
  commissionPct: professional.commissionPct,
  active: professional.isActive,
});

export interface ProcedureDto {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  /** Nº de insumos no kit padrão — "Kit" deixa de ser opaco na listagem (PROC-03). */
  kitItemCount: number;
}

export const toProcedureDto = (
  procedure: CatalogProcedure,
  kitItemCount = 0,
): ProcedureDto => ({
  id: procedure.id,
  name: procedure.name,
  priceCents: procedure.priceCents,
  durationMinutes: procedure.durationMinutes,
  active: procedure.isActive,
  kitItemCount,
});

/** Conta de acesso — nunca expõe o hash de senha. */
export interface UserAccountDto {
  id: string;
  email: string;
  professionalId: string | null;
  active: boolean;
  /** `false` = conta nunca logou (convite ainda não consumido) — habilita reenvio na UI. */
  passwordSet: boolean;
}

export const toUserAccountDto = (account: UserAccount): UserAccountDto => ({
  id: account.id,
  email: account.email,
  professionalId: account.professionalId,
  active: account.isActive,
  passwordSet: account.passwordHash !== UNSET_PASSWORD_HASH,
});

/** Dados cadastrais da clínica — cabeçalho/rodapé de documentos emitidos (#61/#62). */
export interface ClinicInfoDto {
  name: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
}

export const toClinicInfoDto = (clinic: Clinic): ClinicInfoDto => ({
  name: clinic.name,
  cnpj: clinic.cnpj,
  address: clinic.address,
  city: clinic.city,
  professionalName: clinic.professionalName,
  professionalRegistry: clinic.professionalRegistry,
});

/** Identidade da sessão ativa exibida na sidebar (issue #126) — `account` é `null` só em modo aberto (sem sessão real). */
export interface SidebarIdentityDto {
  clinicLabel: string;
  account: { email: string; roleLabel: string } | null;
}
