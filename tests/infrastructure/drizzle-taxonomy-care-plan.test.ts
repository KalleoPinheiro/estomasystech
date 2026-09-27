import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { InterventionRecord } from '@/domain/clinical/intervention-record';
import { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { NursingDiagnosis } from '@/domain/taxonomy/nursing-diagnosis';
import { NursingIntervention } from '@/domain/taxonomy/nursing-intervention';
import { NursingOutcome } from '@/domain/taxonomy/nursing-outcome';
import { TaxonomyLinkage } from '@/domain/taxonomy/taxonomy-linkage';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleCarePlanDiagnosisRepository,
  DrizzleCarePlanInterventionRepository,
  DrizzleCarePlanOutcomeRepository,
  DrizzleCarePlanRepository,
  DrizzleInterventionRecordRepository,
  DrizzleOutcomeEvaluationRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-care-plan-repositories';
import { DrizzleClinicalConditionRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinical-repositories';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleProfessionalRepository } from '@/infrastructure/persistence/drizzle/drizzle-professional-repository';
import {
  DrizzleNursingDiagnosisRepository,
  DrizzleNursingInterventionRepository,
  DrizzleNursingOutcomeRepository,
  DrizzleTaxonomyLinkageRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-taxonomy-repositories';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const scaleAnchors = [
  'Gravemente comprometido',
  'Substancialmente comprometido',
  'Moderadamente comprometido',
  'Levemente comprometido',
  'Não comprometido',
] as const;

describe('Feature: Persistência PostgreSQL — taxonomias de enfermagem e plano de cuidados', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let patient: Patient;
  let professional: Professional;
  let condition: ClinicalCondition;

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;
  });

  beforeEach(async () => {
    await db.delete(schema.interventionRecords);
    await db.delete(schema.outcomeEvaluations);
    await db.delete(schema.carePlanInterventions);
    await db.delete(schema.carePlanOutcomes);
    await db.delete(schema.carePlanDiagnoses);
    await db.delete(schema.carePlans);
    await db.delete(schema.taxonomyLinkages);
    await db.delete(schema.nursingInterventions);
    await db.delete(schema.nursingOutcomes);
    await db.delete(schema.nursingDiagnoses);
    await db.delete(schema.clinicalConditions);
    await db.delete(schema.professionals);
    await db.update(schema.patients).set({ referredByPartnerId: null });
    await db.delete(schema.patients);

    patient = Patient.create({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    ).save(patient);

    professional = Professional.create({
      fullName: 'Enf. Joana Reis',
      registry: 'COREN-SP 123456',
    });
    await new DrizzleProfessionalRepository(appDb, 'legacy-clinic').save(
      professional,
    );

    condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: 'wound',
      title: 'Lesão sacral',
    });
    await new DrizzleClinicalConditionRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    ).save(condition);
  });

  it('Dado diagnóstico NANDA-I salvo, Quando buscar por código/lote/termo, Então roundtrip correto', async () => {
    const repo = new DrizzleNursingDiagnosisRepository(appDb);
    const diagnosis = NursingDiagnosis.create({
      code: '00046',
      label: 'Integridade da pele prejudicada',
      domain: 'Domínio 11 — Segurança/proteção',
      class: 'Classe 2 — Lesão física',
      edition: 'NANDA-I 2021-2023',
    });
    await repo.save(diagnosis);

    expect((await repo.findByCode('00046'))?.label).toBe(
      'Integridade da pele prejudicada',
    );
    expect(await repo.findByCodes(['00046', '99999'])).toHaveLength(1);
    expect(await repo.search('integridade')).toHaveLength(1);
    expect(await repo.search('00046')).toHaveLength(1);
    expect(await repo.findByCode('99999')).toBeNull();
  });

  it('Dado resultado NOC salvo, Quando buscar, Então a escala de 5 âncoras roundtripa intacta', async () => {
    const repo = new DrizzleNursingOutcomeRepository(appDb);
    const outcome = NursingOutcome.create({
      code: '1101',
      label: 'Integridade tissular: pele e mucosas',
      domain: 'Saúde fisiológica',
      class: 'Integridade tissular',
      edition: 'NOC 6ª ed.',
      scaleAnchors,
    });
    await repo.save(outcome);

    const stored = await repo.findByCode('1101');
    expect(stored?.scale.labelFor(1)).toBe('Gravemente comprometido');
    expect(stored?.scale.labelFor(5)).toBe('Não comprometido');
    expect(await repo.findByCodes(['1101'])).toHaveLength(1);
    expect(await repo.search('tissular')).toHaveLength(1);
  });

  it('Dado intervenção NIC salva, Quando buscar, Então roundtrip correto', async () => {
    const repo = new DrizzleNursingInterventionRepository(appDb);
    await repo.save(
      NursingIntervention.create({
        code: '3660',
        label: 'Cuidados com lesões',
        domain: 'Fisiológico: básico',
        class: 'Controle de pele/lesão',
        edition: 'NIC 7ª ed.',
      }),
    );

    expect((await repo.findByCode('3660'))?.label).toBe('Cuidados com lesões');
    expect(await repo.search('cuidados')).toHaveLength(1);
  });

  it('Dado ligações NANDA→NOC/NIC salvas, Quando buscar por diagnóstico e papel, Então filtra corretamente', async () => {
    const repo = new DrizzleTaxonomyLinkageRepository(appDb);
    await repo.save(
      TaxonomyLinkage.create({
        diagnosisCode: '00046',
        role: 'outcome',
        targetCode: '1101',
      }),
    );
    await repo.save(
      TaxonomyLinkage.create({
        diagnosisCode: '00046',
        role: 'intervention',
        targetCode: '3660',
      }),
    );

    const all = await repo.findByDiagnosisCode('00046');
    const onlyOutcomes = await repo.findByDiagnosisCode('00046', 'outcome');

    expect(all).toHaveLength(2);
    expect(onlyOutcomes).toHaveLength(1);
    expect(onlyOutcomes[0].targetCode).toBe('1101');
  });

  it('Dado plano de cuidados completo, Quando salvar e consultar, Então roundtrip de diagnóstico/resultado/intervenção', async () => {
    const carePlanRepo = new DrizzleCarePlanRepository(appDb, 'legacy-clinic');
    const diagnosisRepo = new DrizzleCarePlanDiagnosisRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const outcomeRepo = new DrizzleCarePlanOutcomeRepository(
      appDb,
      'legacy-clinic',
    );
    const interventionRepo = new DrizzleCarePlanInterventionRepository(
      appDb,
      'legacy-clinic',
    );
    const evaluationRepo = new DrizzleOutcomeEvaluationRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );
    const recordRepo = new DrizzleInterventionRecordRepository(
      appDb,
      'legacy-clinic',
      TEST_CIPHER,
    );

    const plan = CarePlan.create({
      patientId: patient.id,
      conditionId: condition.id,
      professionalId: professional.id,
    });
    await carePlanRepo.save(plan);

    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: plan.id,
      diagnosisCode: '00046',
      type: 'real',
      relatedFactors: 'Umidade excessiva por exsudato',
      definingCharacteristics: 'Ruptura da epiderme',
    });
    await diagnosisRepo.save(diagnosis);

    const outcome = CarePlanOutcome.create({
      carePlanId: plan.id,
      outcomeCode: '1101',
      baselineScore: 2,
      targetScore: 4,
      deadline: new Date('2026-03-01T00:00:00Z'),
    });
    await outcomeRepo.save(outcome);

    const intervention = CarePlanIntervention.create({
      carePlanId: plan.id,
      interventionCode: '3660',
      frequency: 'A cada troca de placa',
      priority: 'alta',
    });
    await interventionRepo.save(intervention);

    await evaluationRepo.save(
      OutcomeEvaluation.create({
        outcomeId: outcome.id,
        score: 3,
        professionalId: professional.id,
      }),
    );
    await evaluationRepo.save(
      OutcomeEvaluation.create({
        outcomeId: outcome.id,
        score: 4,
        professionalId: professional.id,
      }),
    );
    await recordRepo.save(
      InterventionRecord.create({
        interventionId: intervention.id,
        professionalId: professional.id,
      }),
    );
    await recordRepo.save(
      InterventionRecord.create({
        interventionId: intervention.id,
        professionalId: professional.id,
      }),
    );

    expect((await carePlanRepo.findById(plan.id))?.professionalId).toBe(
      professional.id,
    );
    expect(await carePlanRepo.findByPatientId(patient.id)).toHaveLength(1);
    expect(await carePlanRepo.findByConditionId(condition.id)).toHaveLength(1);

    const storedDiagnoses = await diagnosisRepo.findByCarePlanId(plan.id);
    expect(storedDiagnoses[0].definingCharacteristics).toBe(
      'Ruptura da epiderme',
    );
    expect(await diagnosisRepo.findByCarePlanIds([plan.id])).toHaveLength(1);

    const storedOutcome = await outcomeRepo.findById(outcome.id);
    expect(storedOutcome?.deadline).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(await outcomeRepo.findByCarePlanId(plan.id)).toHaveLength(1);
    expect(await outcomeRepo.findByCarePlanIds([plan.id])).toHaveLength(1);

    expect((await interventionRepo.findById(intervention.id))?.frequency).toBe(
      'A cada troca de placa',
    );
    expect(await interventionRepo.findByCarePlanId(plan.id)).toHaveLength(1);
    expect(await interventionRepo.findByCarePlanIds([plan.id])).toHaveLength(1);

    const evaluations = await evaluationRepo.findByOutcomeId(outcome.id);
    expect(evaluations).toHaveLength(2);
    expect(evaluations.map((e) => e.score).sort()).toEqual([3, 4]);
    expect(await evaluationRepo.findByOutcomeIds([outcome.id])).toHaveLength(2);

    const records = await recordRepo.findByInterventionId(intervention.id);
    expect(records).toHaveLength(2);
    expect(records.every((r) => r.professionalId === professional.id)).toBe(
      true,
    );
    expect(new Set(records.map((r) => r.id)).size).toBe(2);
    expect(
      await recordRepo.findByInterventionIds([intervention.id]),
    ).toHaveLength(2);

    await carePlanRepo.save(plan.resolve());
    expect((await carePlanRepo.findById(plan.id))?.status).toBe('resolved');
  });

  it('Dado ids vazios, Quando buscar em lote, Então retorna lista vazia sem consultar o banco', async () => {
    expect(
      await new DrizzleCarePlanDiagnosisRepository(
        appDb,
        'legacy-clinic',
        TEST_CIPHER,
      ).findByCarePlanIds([]),
    ).toEqual([]);
    expect(
      await new DrizzleCarePlanOutcomeRepository(
        appDb,
        'legacy-clinic',
      ).findByCarePlanIds([]),
    ).toEqual([]);
    expect(
      await new DrizzleCarePlanInterventionRepository(
        appDb,
        'legacy-clinic',
      ).findByCarePlanIds([]),
    ).toEqual([]);
    expect(
      await new DrizzleOutcomeEvaluationRepository(
        appDb,
        'legacy-clinic',
        TEST_CIPHER,
      ).findByOutcomeIds([]),
    ).toEqual([]);
    expect(
      await new DrizzleInterventionRecordRepository(
        appDb,
        'legacy-clinic',
        TEST_CIPHER,
      ).findByInterventionIds([]),
    ).toEqual([]);
    expect(
      await new DrizzleNursingDiagnosisRepository(appDb).findByCodes([]),
    ).toEqual([]);
    expect(
      await new DrizzleNursingOutcomeRepository(appDb).findByCodes([]),
    ).toEqual([]);
    expect(
      await new DrizzleNursingInterventionRepository(appDb).findByCodes([]),
    ).toEqual([]);
  });
});
