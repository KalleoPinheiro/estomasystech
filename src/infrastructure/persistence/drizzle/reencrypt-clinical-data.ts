import { asc, eq, gt } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import {
  anamneses,
  appointments,
  carePlanDiagnoses,
  clinicalConditions,
  conditionAssessments,
  conditionPhotos,
  dataSubjectRequests,
  evolutionNotes,
  interventionRecords,
  outcomeEvaluations,
  patients,
  waitlistEntries,
} from './schema';

interface CipheredTable {
  name: string;
  table: PgTable;
  key: AnyPgColumn;
  columns: Record<string, AnyPgColumn>;
}

/** Todo texto clínico cifrado em repouso (#195, ADR-006) — a mesma lista dos repositórios. */
export const CIPHERED_TABLES: readonly CipheredTable[] = [
  {
    name: 'evolution_notes',
    table: evolutionNotes,
    key: evolutionNotes.id,
    columns: {
      subjective: evolutionNotes.subjective,
      objective: evolutionNotes.objective,
      assessment: evolutionNotes.assessment,
      plan: evolutionNotes.plan,
    },
  },
  {
    name: 'clinical_conditions',
    table: clinicalConditions,
    key: clinicalConditions.id,
    columns: { notes: clinicalConditions.notes },
  },
  {
    name: 'condition_assessments',
    table: conditionAssessments,
    key: conditionAssessments.id,
    columns: {
      notes: conditionAssessments.notes,
      skinCondition: conditionAssessments.skinCondition,
      complications: conditionAssessments.complications,
    },
  },
  {
    name: 'anamneses',
    table: anamneses,
    key: anamneses.patientId,
    columns: {
      comorbidities: anamneses.comorbidities,
      allergies: anamneses.allergies,
      medications: anamneses.medications,
      surgicalHistory: anamneses.surgicalHistory,
      notes: anamneses.notes,
    },
  },
  {
    name: 'patients',
    table: patients,
    key: patients.id,
    columns: { notes: patients.notes },
  },
  {
    name: 'appointments',
    table: appointments,
    key: appointments.id,
    columns: { notes: appointments.notes },
  },
  {
    name: 'waitlist_entries',
    table: waitlistEntries,
    key: waitlistEntries.id,
    columns: { notes: waitlistEntries.notes },
  },
  {
    name: 'data_subject_requests',
    table: dataSubjectRequests,
    key: dataSubjectRequests.id,
    columns: {
      details: dataSubjectRequests.details,
      resolution: dataSubjectRequests.resolution,
    },
  },
  {
    name: 'condition_photos',
    table: conditionPhotos,
    key: conditionPhotos.id,
    columns: { patientNote: conditionPhotos.patientNote },
  },
  {
    name: 'care_plan_diagnoses',
    table: carePlanDiagnoses,
    key: carePlanDiagnoses.id,
    columns: {
      relatedFactors: carePlanDiagnoses.relatedFactors,
      definingCharacteristics: carePlanDiagnoses.definingCharacteristics,
    },
  },
  {
    name: 'outcome_evaluations',
    table: outcomeEvaluations,
    key: outcomeEvaluations.id,
    columns: { notes: outcomeEvaluations.notes },
  },
  {
    name: 'intervention_records',
    table: interventionRecords,
    key: interventionRecords.id,
    columns: { notes: interventionRecords.notes },
  },
];

const BATCH_SIZE = 200;

/** Valor que precisa ser regravado: em claro, formato legado ou chave anterior. */
function rewrite(cipher: FieldCipher, value: unknown): string | null {
  if (typeof value !== 'string' || value === '' || cipher.isCurrent(value)) {
    return null;
  }
  return cipher.encrypt(cipher.decrypt(value));
}

function pendingChanges(
  cipher: FieldCipher,
  row: Record<string, unknown>,
  columns: readonly string[],
): Record<string, string> {
  const changes: Record<string, string> = {};
  for (const column of columns) {
    const next = rewrite(cipher, row[column]);
    if (next !== null) changes[column] = next;
  }
  return changes;
}

async function reencryptTable(
  db: AppDb,
  cipher: FieldCipher,
  target: CipheredTable,
): Promise<number> {
  const names = Object.keys(target.columns);
  let updated = 0;
  let after = '';
  for (;;) {
    // Paginação por chave (não OFFSET): a linha regravada não muda de posição.
    const rows = (await db
      .select({ key: target.key, ...target.columns })
      .from(target.table)
      .where(gt(target.key, after))
      .orderBy(asc(target.key))
      .limit(BATCH_SIZE)) as Record<string, unknown>[];
    if (rows.length === 0) return updated;
    for (const row of rows) {
      const changes = pendingChanges(cipher, row, names);
      if (Object.keys(changes).length > 0) {
        await db
          .update(target.table)
          .set(changes)
          .where(eq(target.key, row.key as string));
        updated += 1;
      }
    }
    after = rows[rows.length - 1].key as string;
  }
}

/**
 * Regrava com a chave atual todo texto clínico em claro, no formato legado
 * (`AUTH_SECRET`) ou cifrado com uma chave anterior (#195). Idempotente:
 * valor já cifrado com a chave atual é pulado, então pode ser interrompido e
 * rodado de novo. Devolve quantas linhas mudaram por tabela.
 */
export async function reencryptClinicalData(
  db: AppDb,
  cipher: FieldCipher,
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const target of CIPHERED_TABLES) {
    result[target.name] = await reencryptTable(db, cipher, target);
  }
  return result;
}
