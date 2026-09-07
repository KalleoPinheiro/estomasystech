import type { CarePlanDetail } from '@/application/clinical/get-care-plan';
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
import type { InterventionRecord } from '@/domain/clinical/intervention-record';
import type { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import type { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import type { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import type { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';

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
