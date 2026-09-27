import { asc, desc, eq, inArray } from 'drizzle-orm';
import { CarePlan, type CarePlanStatus } from '@/domain/clinical/care-plan';
import {
  CarePlanDiagnosis,
  type CarePlanDiagnosisType,
} from '@/domain/clinical/care-plan-diagnosis';
import {
  CarePlanIntervention,
  type InterventionPriority,
} from '@/domain/clinical/care-plan-intervention';
import { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import type {
  CarePlanDiagnosisRepository,
  CarePlanInterventionRepository,
  CarePlanOutcomeRepository,
  CarePlanRepository,
  InterventionRecordRepository,
  OutcomeEvaluationRepository,
} from '@/domain/clinical/clinical-repositories';
import { InterventionRecord } from '@/domain/clinical/intervention-record';
import { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import {
  carePlanDiagnoses,
  carePlanInterventions,
  carePlanOutcomes,
  carePlans,
  interventionRecords,
  outcomeEvaluations,
} from './schema';
import { withTenant } from './tenant-scope';

const systemRoleWriteError = (entity: string): Error =>
  new Error(
    `Papel de sistema não pode salvar ${entity} (somente leitura cross-empresa)`,
  );

export class DrizzleCarePlanRepository implements CarePlanRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private toEntity(row: typeof carePlans.$inferSelect): CarePlan {
    return CarePlan.restore({ ...row, status: row.status as CarePlanStatus });
  }

  async save(carePlan: CarePlan): Promise<void> {
    if (this.clinicId === null) {
      throw systemRoleWriteError('plano de cuidado');
    }
    const values = {
      id: carePlan.id,
      clinicId: this.clinicId,
      patientId: carePlan.patientId,
      conditionId: carePlan.conditionId,
      professionalId: carePlan.professionalId,
      status: carePlan.status,
      createdAt: carePlan.createdAt,
    };
    await this.db
      .insert(carePlans)
      .values(values)
      .onConflictDoUpdate({ target: carePlans.id, set: values });
  }

  async findById(id: string): Promise<CarePlan | null> {
    const rows = await this.db
      .select()
      .from(carePlans)
      .where(withTenant(carePlans, this.clinicId, eq(carePlans.id, id)))
      .limit(1);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByPatientId(patientId: string): Promise<CarePlan[]> {
    const rows = await this.db
      .select()
      .from(carePlans)
      .where(
        withTenant(
          carePlans,
          this.clinicId,
          eq(carePlans.patientId, patientId),
        ),
      )
      .orderBy(desc(carePlans.createdAt), asc(carePlans.id));
    return rows.map((row) => this.toEntity(row));
  }

  async findByConditionId(conditionId: string): Promise<CarePlan[]> {
    const rows = await this.db
      .select()
      .from(carePlans)
      .where(
        withTenant(
          carePlans,
          this.clinicId,
          eq(carePlans.conditionId, conditionId),
        ),
      )
      .orderBy(desc(carePlans.createdAt), asc(carePlans.id));
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleCarePlanDiagnosisRepository
  implements CarePlanDiagnosisRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof carePlanDiagnoses.$inferSelect,
  ): CarePlanDiagnosis {
    return CarePlanDiagnosis.restore({
      ...row,
      type: row.type as CarePlanDiagnosisType,
      relatedFactors: this.cipher.decryptNullable(row.relatedFactors),
      definingCharacteristics: this.cipher.decryptNullable(
        row.definingCharacteristics,
      ),
    });
  }

  async save(diagnosis: CarePlanDiagnosis): Promise<void> {
    if (this.clinicId === null) {
      throw systemRoleWriteError('diagnóstico de plano de cuidado');
    }
    await this.db.insert(carePlanDiagnoses).values({
      id: diagnosis.id,
      clinicId: this.clinicId,
      carePlanId: diagnosis.carePlanId,
      diagnosisCode: diagnosis.diagnosisCode,
      type: diagnosis.type,
      relatedFactors: this.cipher.encryptNullable(diagnosis.relatedFactors),
      definingCharacteristics: this.cipher.encryptNullable(
        diagnosis.definingCharacteristics,
      ),
      createdAt: diagnosis.createdAt,
    });
  }

  async findByCarePlanId(carePlanId: string): Promise<CarePlanDiagnosis[]> {
    const rows = await this.db
      .select()
      .from(carePlanDiagnoses)
      .where(
        withTenant(
          carePlanDiagnoses,
          this.clinicId,
          eq(carePlanDiagnoses.carePlanId, carePlanId),
        ),
      )
      .orderBy(desc(carePlanDiagnoses.createdAt), asc(carePlanDiagnoses.id));
    return rows.map((row) => this.toEntity(row));
  }

  async findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanDiagnosis[]> {
    const unique = [...new Set(carePlanIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(carePlanDiagnoses)
      .where(
        withTenant(
          carePlanDiagnoses,
          this.clinicId,
          inArray(carePlanDiagnoses.carePlanId, unique),
        ),
      )
      .orderBy(desc(carePlanDiagnoses.createdAt), asc(carePlanDiagnoses.id));
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleCarePlanOutcomeRepository
  implements CarePlanOutcomeRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private toEntity(row: typeof carePlanOutcomes.$inferSelect): CarePlanOutcome {
    return CarePlanOutcome.restore(row);
  }

  async save(outcome: CarePlanOutcome): Promise<void> {
    if (this.clinicId === null) {
      throw systemRoleWriteError('resultado de plano de cuidado');
    }
    await this.db.insert(carePlanOutcomes).values({
      id: outcome.id,
      clinicId: this.clinicId,
      carePlanId: outcome.carePlanId,
      outcomeCode: outcome.outcomeCode,
      baselineScore: outcome.baselineScore,
      targetScore: outcome.targetScore,
      deadline: outcome.deadline,
      createdAt: outcome.createdAt,
    });
  }

  async findById(id: string): Promise<CarePlanOutcome | null> {
    const rows = await this.db
      .select()
      .from(carePlanOutcomes)
      .where(
        withTenant(
          carePlanOutcomes,
          this.clinicId,
          eq(carePlanOutcomes.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByCarePlanId(carePlanId: string): Promise<CarePlanOutcome[]> {
    const rows = await this.db
      .select()
      .from(carePlanOutcomes)
      .where(
        withTenant(
          carePlanOutcomes,
          this.clinicId,
          eq(carePlanOutcomes.carePlanId, carePlanId),
        ),
      )
      .orderBy(desc(carePlanOutcomes.createdAt), asc(carePlanOutcomes.id));
    return rows.map((row) => this.toEntity(row));
  }

  async findByCarePlanIds(carePlanIds: string[]): Promise<CarePlanOutcome[]> {
    const unique = [...new Set(carePlanIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(carePlanOutcomes)
      .where(
        withTenant(
          carePlanOutcomes,
          this.clinicId,
          inArray(carePlanOutcomes.carePlanId, unique),
        ),
      )
      .orderBy(desc(carePlanOutcomes.createdAt), asc(carePlanOutcomes.id));
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleCarePlanInterventionRepository
  implements CarePlanInterventionRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private toEntity(
    row: typeof carePlanInterventions.$inferSelect,
  ): CarePlanIntervention {
    return CarePlanIntervention.restore({
      ...row,
      priority: row.priority as InterventionPriority,
    });
  }

  async save(intervention: CarePlanIntervention): Promise<void> {
    if (this.clinicId === null) {
      throw systemRoleWriteError('intervenção de plano de cuidado');
    }
    await this.db.insert(carePlanInterventions).values({
      id: intervention.id,
      clinicId: this.clinicId,
      carePlanId: intervention.carePlanId,
      interventionCode: intervention.interventionCode,
      frequency: intervention.frequency,
      priority: intervention.priority,
      createdAt: intervention.createdAt,
    });
  }

  async findById(id: string): Promise<CarePlanIntervention | null> {
    const rows = await this.db
      .select()
      .from(carePlanInterventions)
      .where(
        withTenant(
          carePlanInterventions,
          this.clinicId,
          eq(carePlanInterventions.id, id),
        ),
      )
      .limit(1);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByCarePlanId(carePlanId: string): Promise<CarePlanIntervention[]> {
    const rows = await this.db
      .select()
      .from(carePlanInterventions)
      .where(
        withTenant(
          carePlanInterventions,
          this.clinicId,
          eq(carePlanInterventions.carePlanId, carePlanId),
        ),
      )
      .orderBy(
        desc(carePlanInterventions.createdAt),
        asc(carePlanInterventions.id),
      );
    return rows.map((row) => this.toEntity(row));
  }

  async findByCarePlanIds(
    carePlanIds: string[],
  ): Promise<CarePlanIntervention[]> {
    const unique = [...new Set(carePlanIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(carePlanInterventions)
      .where(
        withTenant(
          carePlanInterventions,
          this.clinicId,
          inArray(carePlanInterventions.carePlanId, unique),
        ),
      )
      .orderBy(
        desc(carePlanInterventions.createdAt),
        asc(carePlanInterventions.id),
      );
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleOutcomeEvaluationRepository
  implements OutcomeEvaluationRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof outcomeEvaluations.$inferSelect,
  ): OutcomeEvaluation {
    return OutcomeEvaluation.restore({
      ...row,
      notes: this.cipher.decryptNullable(row.notes),
    });
  }

  async save(evaluation: OutcomeEvaluation): Promise<void> {
    if (this.clinicId === null) {
      throw systemRoleWriteError('avaliação de desfecho');
    }
    await this.db.insert(outcomeEvaluations).values({
      id: evaluation.id,
      clinicId: this.clinicId,
      outcomeId: evaluation.outcomeId,
      score: evaluation.score,
      professionalId: evaluation.professionalId,
      notes: this.cipher.encryptNullable(evaluation.notes),
      evaluatedAt: evaluation.evaluatedAt,
    });
  }

  async findByOutcomeId(outcomeId: string): Promise<OutcomeEvaluation[]> {
    const rows = await this.db
      .select()
      .from(outcomeEvaluations)
      .where(
        withTenant(
          outcomeEvaluations,
          this.clinicId,
          eq(outcomeEvaluations.outcomeId, outcomeId),
        ),
      )
      .orderBy(
        desc(outcomeEvaluations.evaluatedAt),
        asc(outcomeEvaluations.id),
      );
    return rows.map((row) => this.toEntity(row));
  }

  async findByOutcomeIds(outcomeIds: string[]): Promise<OutcomeEvaluation[]> {
    const unique = [...new Set(outcomeIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(outcomeEvaluations)
      .where(
        withTenant(
          outcomeEvaluations,
          this.clinicId,
          inArray(outcomeEvaluations.outcomeId, unique),
        ),
      )
      .orderBy(
        desc(outcomeEvaluations.evaluatedAt),
        asc(outcomeEvaluations.id),
      );
    return rows.map((row) => this.toEntity(row));
  }
}

export class DrizzleInterventionRecordRepository
  implements InterventionRecordRepository
{
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  private toEntity(
    row: typeof interventionRecords.$inferSelect,
  ): InterventionRecord {
    return InterventionRecord.restore({
      ...row,
      notes: this.cipher.decryptNullable(row.notes),
    });
  }

  async save(record: InterventionRecord): Promise<void> {
    if (this.clinicId === null) {
      throw systemRoleWriteError('registro de intervenção');
    }
    await this.db.insert(interventionRecords).values({
      id: record.id,
      clinicId: this.clinicId,
      interventionId: record.interventionId,
      professionalId: record.professionalId,
      notes: this.cipher.encryptNullable(record.notes),
      performedAt: record.performedAt,
    });
  }

  async findByInterventionId(
    interventionId: string,
  ): Promise<InterventionRecord[]> {
    const rows = await this.db
      .select()
      .from(interventionRecords)
      .where(
        withTenant(
          interventionRecords,
          this.clinicId,
          eq(interventionRecords.interventionId, interventionId),
        ),
      )
      .orderBy(
        desc(interventionRecords.performedAt),
        asc(interventionRecords.id),
      );
    return rows.map((row) => this.toEntity(row));
  }

  async findByInterventionIds(
    interventionIds: string[],
  ): Promise<InterventionRecord[]> {
    const unique = [...new Set(interventionIds)];
    if (unique.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(interventionRecords)
      .where(
        withTenant(
          interventionRecords,
          this.clinicId,
          inArray(interventionRecords.interventionId, unique),
        ),
      )
      .orderBy(
        desc(interventionRecords.performedAt),
        asc(interventionRecords.id),
      );
    return rows.map((row) => this.toEntity(row));
  }
}
