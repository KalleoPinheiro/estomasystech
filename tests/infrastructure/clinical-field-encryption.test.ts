import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Anamnesis } from '@/domain/clinical/anamnesis';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import { ClinicalCondition } from '@/domain/clinical/clinical-condition';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { ConditionPhoto } from '@/domain/clinical/condition-photo';
import { EvolutionNote } from '@/domain/clinical/evolution-note';
import { InterventionRecord } from '@/domain/clinical/intervention-record';
import { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import {
  DrizzleCarePlanDiagnosisRepository,
  DrizzleCarePlanInterventionRepository,
  DrizzleCarePlanOutcomeRepository,
  DrizzleCarePlanRepository,
  DrizzleInterventionRecordRepository,
  DrizzleOutcomeEvaluationRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-care-plan-repositories';
import {
  DrizzleAnamnesisRepository,
  DrizzleClinicalConditionRepository,
  DrizzleConditionAssessmentRepository,
  DrizzleConditionPhotoRepository,
  DrizzleEvolutionNoteRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-clinical-repositories';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleWaitlistRepository } from '@/infrastructure/persistence/drizzle/drizzle-waitlist-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER as cipher } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const SECRET_TEXT = 'Texto clínico sigiloso — HIV positivo';
const V1 = /^v1\.[0-9a-f]{8}\./;

interface Case {
  /** Tabela e colunas como estão no banco. */
  table: string;
  columns: string[];
  id: string;
  /** Lê de volta pelo repositório e devolve os valores em claro. */
  readBack: () => Promise<(string | null | undefined)[]>;
}

describe('Feature: textos clínicos cifrados em repouso (#195)', () => {
  let db: PgliteDatabase<typeof schema>;
  const cases: Case[] = [];

  const rawColumns = async (table: string, columns: string[], id: string) => {
    const key = table === 'anamneses' ? 'patient_id' : 'id';
    const result = (await db.execute(
      sql.raw(
        `SELECT ${columns.join(', ')} FROM ${table} WHERE ${key} = '${id}'`,
      ),
    )) as unknown as { rows: Record<string, string>[] };
    return columns.map((column) => result.rows[0]?.[column]);
  };

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    const appDb = db as unknown as AppDb;
    const repo = <T>(Ctor: new (db: AppDb, c: string, k: typeof cipher) => T) =>
      new Ctor(appDb, CLINIC, cipher);

    const patients = repo(DrizzlePatientRepository);
    const patient = Patient.create({
      fullName: 'Paciente Cifra',
      email: 'cifra@x.com',
      phone: '1',
      notes: SECRET_TEXT,
    });
    await patients.save(patient);
    cases.push({
      table: 'patients',
      columns: ['notes'],
      id: patient.id,
      readBack: async () => [(await patients.findById(patient.id))?.notes],
    });

    const appointments = repo(DrizzleAppointmentRepository);
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(
        new Date('2027-01-11T12:00:00Z'),
        new Date('2027-01-11T13:00:00Z'),
      ),
      procedure: 'Curativo',
      price: Money.fromCents(100),
      notes: SECRET_TEXT,
    });
    await appointments.save(appointment);
    cases.push({
      table: 'appointments',
      columns: ['notes'],
      id: appointment.id,
      readBack: async () => [
        (await appointments.findById(appointment.id))?.notes,
      ],
    });

    const waitlist = repo(DrizzleWaitlistRepository);
    const entry = WaitlistEntry.create(
      {
        patientId: patient.id,
        fromDate: '2027-01-10',
        toDate: '2027-01-20',
        notes: SECRET_TEXT,
        source: 'staff',
      },
      new Date('2027-01-01T12:00:00Z'),
    );
    await waitlist.save(entry);
    cases.push({
      table: 'waitlist_entries',
      columns: ['notes'],
      id: entry.id,
      readBack: async () => [(await waitlist.findById(entry.id))?.notes],
    });

    const anamneses = repo(DrizzleAnamnesisRepository);
    await anamneses.save(
      Anamnesis.create({
        patientId: patient.id,
        comorbidities: SECRET_TEXT,
        allergies: SECRET_TEXT,
        medications: SECRET_TEXT,
        surgicalHistory: SECRET_TEXT,
        notes: SECRET_TEXT,
      }),
    );
    cases.push({
      table: 'anamneses',
      columns: [
        'comorbidities',
        'allergies',
        'medications',
        'surgical_history',
        'notes',
      ],
      id: patient.id,
      readBack: async () => {
        const a = await anamneses.findByPatientId(patient.id);
        return [
          a?.comorbidities,
          a?.allergies,
          a?.medications,
          a?.surgicalHistory,
          a?.notes,
        ];
      },
    });

    const evolutions = repo(DrizzleEvolutionNoteRepository);
    const note = EvolutionNote.create({
      patientId: patient.id,
      subjective: SECRET_TEXT,
      objective: SECRET_TEXT,
      assessment: SECRET_TEXT,
      plan: SECRET_TEXT,
    });
    await evolutions.save(note);
    cases.push({
      table: 'evolution_notes',
      columns: ['subjective', 'objective', 'assessment', 'plan'],
      id: note.id,
      readBack: async () => {
        const n = (await evolutions.findByPatientId(patient.id))[0];
        return [n?.subjective, n?.objective, n?.assessment, n?.plan];
      },
    });

    const conditions = repo(DrizzleClinicalConditionRepository);
    const condition = ClinicalCondition.create({
      patientId: patient.id,
      kind: 'wound',
      title: 'Lesão',
      notes: SECRET_TEXT,
    });
    await conditions.save(condition);
    cases.push({
      table: 'clinical_conditions',
      columns: ['notes'],
      id: condition.id,
      readBack: async () => [(await conditions.findById(condition.id))?.notes],
    });

    const assessments = repo(DrizzleConditionAssessmentRepository);
    const assessment = ConditionAssessment.create({
      conditionId: condition.id,
      notes: SECRET_TEXT,
      skinCondition: SECRET_TEXT,
      complications: SECRET_TEXT,
    });
    await assessments.save(assessment);
    cases.push({
      table: 'condition_assessments',
      columns: ['notes', 'skin_condition', 'complications'],
      id: assessment.id,
      readBack: async () => {
        const a = (await assessments.findByConditionIds([condition.id]))[0];
        return [a?.notes, a?.skinCondition, a?.complications];
      },
    });

    const photos = repo(DrizzleConditionPhotoRepository);
    const photo = ConditionPhoto.create({
      conditionId: condition.id,
      contentType: 'image/jpeg',
      sizeBytes: 10,
      origin: 'patient',
      patientNote: SECRET_TEXT,
    });
    await photos.save(photo);
    cases.push({
      table: 'condition_photos',
      columns: ['patient_note'],
      id: photo.id,
      readBack: async () => [(await photos.findById(photo.id))?.patientNote],
    });

    const plan = CarePlan.create({ patientId: patient.id });
    await repo(DrizzleCarePlanRepository).save(plan);
    const diagnoses = repo(DrizzleCarePlanDiagnosisRepository);
    const diagnosis = CarePlanDiagnosis.create({
      carePlanId: plan.id,
      diagnosisCode: '00046',
      type: 'real',
      relatedFactors: SECRET_TEXT,
      definingCharacteristics: SECRET_TEXT,
    });
    await diagnoses.save(diagnosis);
    cases.push({
      table: 'care_plan_diagnoses',
      columns: ['related_factors', 'defining_characteristics'],
      id: diagnosis.id,
      readBack: async () => {
        const d = (await diagnoses.findByCarePlanId(plan.id))[0];
        return [d?.relatedFactors, d?.definingCharacteristics];
      },
    });

    const outcome = CarePlanOutcome.create({
      carePlanId: plan.id,
      outcomeCode: '1101',
      baselineScore: 2,
      targetScore: 4,
      deadline: new Date('2027-03-01T00:00:00Z'),
    });
    await repo(DrizzleCarePlanOutcomeRepository).save(outcome);
    const evaluations = repo(DrizzleOutcomeEvaluationRepository);
    const evaluation = OutcomeEvaluation.create({
      outcomeId: outcome.id,
      score: 3,
      notes: SECRET_TEXT,
    });
    await evaluations.save(evaluation);
    cases.push({
      table: 'outcome_evaluations',
      columns: ['notes'],
      id: evaluation.id,
      readBack: async () => [
        (await evaluations.findByOutcomeId(outcome.id))[0]?.notes,
      ],
    });

    const intervention = CarePlanIntervention.create({
      carePlanId: plan.id,
      interventionCode: '3660',
      frequency: 'Diária',
      priority: 'alta',
    });
    await repo(DrizzleCarePlanInterventionRepository).save(intervention);
    const records = repo(DrizzleInterventionRecordRepository);
    const record = InterventionRecord.create({
      interventionId: intervention.id,
      notes: SECRET_TEXT,
    });
    await records.save(record);
    cases.push({
      table: 'intervention_records',
      columns: ['notes'],
      id: record.id,
      readBack: async () => [
        (await records.findByInterventionId(intervention.id))[0]?.notes,
      ],
    });
  });

  it('stores ciphertext: 21 colunas em 11 tabelas gravam v1 e voltam em claro pelo repositório', async () => {
    const columns = cases.flatMap((c) =>
      c.columns.map((col) => `${c.table}.${col}`),
    );
    expect(columns).toHaveLength(21);

    for (const c of cases) {
      const stored = await rawColumns(c.table, c.columns, c.id);
      for (const [index, value] of stored.entries()) {
        const where = `${c.table}.${c.columns[index]}`;
        expect(value, where).toMatch(V1);
        expect(value, where).not.toContain('HIV');
      }
      expect(await c.readBack(), c.table).toEqual(
        c.columns.map(() => SECRET_TEXT),
      );
    }
  });
});
