import type { CarePlan } from '@/domain/clinical/care-plan';
import type { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import type { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import type { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import type {
  CarePlanDiagnosisRepository,
  CarePlanInterventionRepository,
  CarePlanOutcomeRepository,
  CarePlanRepository,
  InterventionRecordRepository,
  NursingPrescriptionRepository,
  OutcomeEvaluationRepository,
} from '@/domain/clinical/clinical-repositories';
import type { InterventionRecord } from '@/domain/clinical/intervention-record';
import type { NursingPrescription } from '@/domain/clinical/nursing-prescription';
import type { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';

export class InMemoryCarePlanRepository implements CarePlanRepository {
  private readonly items = new Map<string, CarePlan>();

  async save(carePlan: CarePlan): Promise<void> {
    this.items.set(carePlan.id, carePlan);
  }

  async findById(id: string): Promise<CarePlan | null> {
    return this.items.get(id) ?? null;
  }

  async findByPatientId(patientId: string): Promise<CarePlan[]> {
    return [...this.items.values()]
      .filter((plan) => plan.patientId === patientId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  async findByConditionId(conditionId: string): Promise<CarePlan[]> {
    return [...this.items.values()]
      .filter((plan) => plan.conditionId === conditionId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }
}

export class InMemoryCarePlanDiagnosisRepository
  implements CarePlanDiagnosisRepository
{
  private readonly items = new Map<string, CarePlanDiagnosis>();

  async save(diagnosis: CarePlanDiagnosis): Promise<void> {
    this.items.set(diagnosis.id, diagnosis);
  }

  async findByCarePlanId(carePlanId: string): Promise<CarePlanDiagnosis[]> {
    return [...this.items.values()]
      .filter((item) => item.carePlanId === carePlanId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  async findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanDiagnosis[]> {
    const ids = new Set(carePlanIds);
    return [...this.items.values()]
      .filter((item) => ids.has(item.carePlanId))
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }
}

export class InMemoryCarePlanOutcomeRepository
  implements CarePlanOutcomeRepository
{
  private readonly items = new Map<string, CarePlanOutcome>();

  async save(outcome: CarePlanOutcome): Promise<void> {
    this.items.set(outcome.id, outcome);
  }

  async findById(id: string): Promise<CarePlanOutcome | null> {
    return this.items.get(id) ?? null;
  }

  async findByCarePlanId(carePlanId: string): Promise<CarePlanOutcome[]> {
    return [...this.items.values()]
      .filter((item) => item.carePlanId === carePlanId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  async findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanOutcome[]> {
    const ids = new Set(carePlanIds);
    return [...this.items.values()]
      .filter((item) => ids.has(item.carePlanId))
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }
}

export class InMemoryCarePlanInterventionRepository
  implements CarePlanInterventionRepository
{
  private readonly items = new Map<string, CarePlanIntervention>();

  async save(intervention: CarePlanIntervention): Promise<void> {
    this.items.set(intervention.id, intervention);
  }

  async findById(id: string): Promise<CarePlanIntervention | null> {
    return this.items.get(id) ?? null;
  }

  async findByCarePlanId(carePlanId: string): Promise<CarePlanIntervention[]> {
    return [...this.items.values()]
      .filter((item) => item.carePlanId === carePlanId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  async findByCarePlanIds(
    carePlanIds: string[],
  ): Promise<CarePlanIntervention[]> {
    const ids = new Set(carePlanIds);
    return [...this.items.values()]
      .filter((item) => ids.has(item.carePlanId))
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }
}

export class InMemoryOutcomeEvaluationRepository
  implements OutcomeEvaluationRepository
{
  private readonly items: OutcomeEvaluation[] = [];

  async save(evaluation: OutcomeEvaluation): Promise<void> {
    this.items.push(evaluation);
  }

  async findByOutcomeId(outcomeId: string): Promise<OutcomeEvaluation[]> {
    return this.items
      .filter((item) => item.outcomeId === outcomeId)
      .sort(
        (a, b) =>
          b.evaluatedAt.getTime() - a.evaluatedAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  async findByOutcomeIds(outcomeIds: string[]): Promise<OutcomeEvaluation[]> {
    const ids = new Set(outcomeIds);
    return this.items
      .filter((item) => ids.has(item.outcomeId))
      .sort(
        (a, b) =>
          b.evaluatedAt.getTime() - a.evaluatedAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }
}

export class InMemoryInterventionRecordRepository
  implements InterventionRecordRepository
{
  private readonly items: InterventionRecord[] = [];

  async save(record: InterventionRecord): Promise<void> {
    this.items.push(record);
  }

  async findByInterventionId(
    interventionId: string,
  ): Promise<InterventionRecord[]> {
    return this.items
      .filter((item) => item.interventionId === interventionId)
      .sort(
        (a, b) =>
          b.performedAt.getTime() - a.performedAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }

  async findByInterventionIds(
    interventionIds: string[],
  ): Promise<InterventionRecord[]> {
    const ids = new Set(interventionIds);
    return this.items
      .filter((item) => ids.has(item.interventionId))
      .sort(
        (a, b) =>
          b.performedAt.getTime() - a.performedAt.getTime() ||
          a.id.localeCompare(b.id),
      );
  }
}

export class InMemoryNursingPrescriptionRepository
  implements NursingPrescriptionRepository
{
  private readonly items = new Map<string, NursingPrescription>();

  async save(prescription: NursingPrescription): Promise<void> {
    this.items.set(prescription.id, prescription);
  }

  async findById(id: string): Promise<NursingPrescription | null> {
    return this.items.get(id) ?? null;
  }

  async findByCarePlanId(carePlanId: string): Promise<NursingPrescription[]> {
    return [...this.items.values()]
      .filter((item) => item.carePlanId === carePlanId)
      .sort(
        (a, b) =>
          b.issuedAt.getTime() - a.issuedAt.getTime() ||
          b.id.localeCompare(a.id),
      );
  }
}
