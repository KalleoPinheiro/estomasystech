import type { Anamnesis } from './anamnesis';
import type { CarePlan } from './care-plan';
import type { CarePlanDiagnosis } from './care-plan-diagnosis';
import type { CarePlanIntervention } from './care-plan-intervention';
import type { CarePlanOutcome } from './care-plan-outcome';
import type { ClinicalCondition } from './clinical-condition';
import type { ConditionAssessment } from './condition-assessment';
import type { ConditionPhoto } from './condition-photo';
import type { EvolutionNote } from './evolution-note';
import type { InterventionRecord } from './intervention-record';
import type { OutcomeEvaluation } from './outcome-evaluation';

export interface AnamnesisRepository {
  save(anamnesis: Anamnesis): Promise<void>;
  findByPatientId(patientId: string): Promise<Anamnesis | null>;
}

export interface EvolutionNoteRepository {
  save(note: EvolutionNote): Promise<void>;
  findByPatientId(patientId: string): Promise<EvolutionNote[]>;
}

export interface ClinicalConditionRepository {
  save(condition: ClinicalCondition): Promise<void>;
  findById(id: string): Promise<ClinicalCondition | null>;
  findByIds(ids: string[]): Promise<ClinicalCondition[]>;
  findByPatientId(patientId: string): Promise<ClinicalCondition[]>;
  /** Busca em lote — evita N+1 ao montar dados de vários pacientes. */
  findByPatientIds(patientIds: string[]): Promise<ClinicalCondition[]>;
}

export interface ConditionPhotoRepository {
  save(photo: ConditionPhoto): Promise<void>;
  findById(id: string): Promise<ConditionPhoto | null>;
  findByConditionId(conditionId: string): Promise<ConditionPhoto[]>;
  findByConditionIds(conditionIds: string[]): Promise<ConditionPhoto[]>;
  /** Fila de triagem: fotos de pacientes aguardando avaliação. */
  findPendingTriage(): Promise<ConditionPhoto[]>;
  /** Fotos enviadas pelo paciente nessas condições desde `since` (cota diária, #213). */
  countPatientUploadsSince(
    conditionIds: string[],
    since: Date,
  ): Promise<number>;
  /** Exclusão restrita a correção de upload — sempre auditada na camada de API. */
  delete(id: string): Promise<void>;
}

export interface ConditionAssessmentRepository {
  save(assessment: ConditionAssessment): Promise<void>;
  findByConditionId(conditionId: string): Promise<ConditionAssessment[]>;
  /** Busca em lote — evita N+1 ao montar dados de várias condições. */
  findByConditionIds(conditionIds: string[]): Promise<ConditionAssessment[]>;
}

export interface CarePlanRepository {
  save(carePlan: CarePlan): Promise<void>;
  findById(id: string): Promise<CarePlan | null>;
  findByPatientId(patientId: string): Promise<CarePlan[]>;
  findByConditionId(conditionId: string): Promise<CarePlan[]>;
}

export interface CarePlanDiagnosisRepository {
  save(diagnosis: CarePlanDiagnosis): Promise<void>;
  findByCarePlanId(carePlanId: string): Promise<CarePlanDiagnosis[]>;
  findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanDiagnosis[]>;
}

export interface CarePlanOutcomeRepository {
  save(outcome: CarePlanOutcome): Promise<void>;
  findById(id: string): Promise<CarePlanOutcome | null>;
  findByCarePlanId(carePlanId: string): Promise<CarePlanOutcome[]>;
  findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanOutcome[]>;
}

export interface CarePlanInterventionRepository {
  save(intervention: CarePlanIntervention): Promise<void>;
  findById(id: string): Promise<CarePlanIntervention | null>;
  findByCarePlanId(carePlanId: string): Promise<CarePlanIntervention[]>;
  findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanIntervention[]>;
}

export interface OutcomeEvaluationRepository {
  save(evaluation: OutcomeEvaluation): Promise<void>;
  findByOutcomeId(outcomeId: string): Promise<OutcomeEvaluation[]>;
  findByOutcomeIds(outcomeIds: string[]): Promise<OutcomeEvaluation[]>;
}

export interface InterventionRecordRepository {
  save(record: InterventionRecord): Promise<void>;
  findByInterventionId(interventionId: string): Promise<InterventionRecord[]>;
  findByInterventionIds(
    interventionIds: string[],
  ): Promise<InterventionRecord[]>;
}
