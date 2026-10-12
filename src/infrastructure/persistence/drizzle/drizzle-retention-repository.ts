import {
  and,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  ANONYMIZED_CONDITION_TITLE,
  ANONYMIZED_MARKER,
  ANONYMIZED_PASSWORD_HASH,
  ANONYMIZED_PATIENT_NAME,
  anonymizedEmail,
} from '@/domain/retention/retention-policy';
import type {
  PendingPhoto,
  RetentionRepository,
} from '@/domain/retention/retention-repository';
import type { AppDb } from './db';
import {
  anamneses,
  appointments,
  auditEvents,
  authTokens,
  carePlanDiagnoses,
  carePlanInterventions,
  carePlanOutcomes,
  carePlans,
  clinicalConditions,
  conditionAssessments,
  conditionPhotos,
  consentRecords,
  evolutionNotes,
  followUps,
  interventionRecords,
  mfaRecoveryCodes,
  outcomeEvaluations,
  partnerShareConsents,
  patients,
  userAccounts,
  userMfa,
  waitlistEntries,
} from './schema';

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0];
type Db = AppDb | Tx;

/** Papéis cobertos pela regra de contas inativas (#294); parceiro fica de fora. */
const ACCOUNT_ROLES = ['company_admin', 'atendente', 'profissional', 'patient'];
const RESOLVED_WAITLIST = ['scheduled', 'removed'];

export const RETENTION_NEEDS_CLINIC_SCOPE =
  'Retenção do prontuário, da fila e das contas exige escopo de clínica';

/**
 * Anonimização por prazo (#294). Única escrita permitida sobre a trilha de
 * auditoria, que fora daqui é append-only. Em escopo de sistema (`clinicId`
 * nulo) só a trilha de plataforma é tratada; os demais métodos recusam.
 */
export class DrizzleRetentionRepository implements RetentionRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
  ) {}

  private clinic(): string {
    if (this.clinicId === null) {
      throw new Error(RETENTION_NEEDS_CLINIC_SCOPE);
    }
    return this.clinicId;
  }

  async findPatientsDue(cutoff: Date, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: patients.id })
      .from(patients)
      .where(
        and(
          eq(patients.clinicId, this.clinic()),
          isNull(patients.anonymizedAt),
          lt(patients.createdAt, cutoff),
          sql`not ${activitySince(this.db, cutoff)}`,
        ),
      )
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async anonymizePatient(
    patientId: string,
    now: Date,
    cutoff: Date,
  ): Promise<number> {
    const clinicId = this.clinic();
    return this.db.transaction(async (tx) => {
      const done = await tx
        .update(patients)
        .set({
          fullName: ANONYMIZED_PATIENT_NAME,
          email: anonymizedEmail(patientId),
          phone: '',
          birthDate: sql`date_trunc('year', ${patients.birthDate} at time zone 'UTC') at time zone 'UTC'`,
          notes: null,
          active: false,
          anonymizedAt: now,
        })
        .where(
          and(
            eq(patients.id, patientId),
            eq(patients.clinicId, clinicId),
            isNull(patients.anonymizedAt),
            // Reavaliado aqui: atividade nova entre a busca e a transação adia.
            lt(patients.createdAt, cutoff),
            sql`not ${activitySince(tx, cutoff)}`,
          ),
        )
        .returning({ id: patients.id });
      if (done.length === 0) return 0;
      await clearClinicalText(tx, clinicId, patientId);
      await clearCarePlanText(tx, clinicId, patientId);
      await clearSchedulingText(tx, clinicId, patientId);
      const accounts = await tx
        .select({ id: userAccounts.id })
        .from(userAccounts)
        .where(
          and(
            eq(userAccounts.clinicId, clinicId),
            eq(userAccounts.patientId, patientId),
            isNull(userAccounts.anonymizedAt),
          ),
        );
      await anonymizeAccounts(
        tx,
        clinicId,
        accounts.map((row) => row.id),
        now,
      );
      return 1;
    });
  }

  async findPendingPhotos(limit: number): Promise<PendingPhoto[]> {
    return this.db
      .select({ id: conditionPhotos.id })
      .from(conditionPhotos)
      .innerJoin(
        clinicalConditions,
        eq(clinicalConditions.id, conditionPhotos.conditionId),
      )
      .innerJoin(patients, eq(patients.id, clinicalConditions.patientId))
      .where(
        and(
          eq(conditionPhotos.clinicId, this.clinic()),
          isNull(conditionPhotos.anonymizedAt),
          isNotNull(patients.anonymizedAt),
        ),
      )
      .limit(limit);
  }

  async markPhotoAnonymized(photoId: string, now: Date): Promise<void> {
    await this.db
      .update(conditionPhotos)
      .set({ anonymizedAt: now })
      .where(
        and(
          eq(conditionPhotos.id, photoId),
          eq(conditionPhotos.clinicId, this.clinic()),
        ),
      );
  }

  async anonymizeAuditEvents(cutoff: Date): Promise<number> {
    const owner =
      this.clinicId === null
        ? isNull(auditEvents.clinicId)
        : eq(auditEvents.clinicId, this.clinicId);
    const rows = await this.db
      .update(auditEvents)
      .set({
        actorId: ANONYMIZED_MARKER,
        resourceId: ANONYMIZED_MARKER,
        patientId: null,
        detail: null,
      })
      .where(
        and(
          owner,
          lt(auditEvents.occurredAt, cutoff),
          ne(auditEvents.actorId, ANONYMIZED_MARKER),
        ),
      )
      .returning({ id: auditEvents.id });
    return rows.length;
  }

  async anonymizeWaitlistEntries(cutoff: Date): Promise<number> {
    const rows = await this.db
      .update(waitlistEntries)
      .set({ patientId: null, notes: null })
      .where(
        and(
          eq(waitlistEntries.clinicId, this.clinic()),
          isNotNull(waitlistEntries.patientId),
          inArray(waitlistEntries.status, RESOLVED_WAITLIST),
          sql`coalesce(${waitlistEntries.resolvedAt}, ${waitlistEntries.createdAt}) < ${cutoff.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: waitlistEntries.id });
    return rows.length;
  }

  async anonymizeInactiveAccounts(cutoff: Date, now: Date): Promise<number> {
    const clinicId = this.clinic();
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: userAccounts.id })
        .from(userAccounts)
        .where(
          and(
            eq(userAccounts.clinicId, clinicId),
            eq(userAccounts.active, false),
            isNull(userAccounts.anonymizedAt),
            lt(userAccounts.deactivatedAt, cutoff),
            inArray(userAccounts.role, ACCOUNT_ROLES),
          ),
        )
        .for('update');
      const ids = rows.map((row) => row.id);
      await anonymizeAccounts(tx, clinicId, ids, now);
      return ids.length;
    });
  }
}

/** Existe registro da atividade clínica do paciente a partir do corte? */
function activitySince(db: Db, cutoff: Date): SQL {
  const ofPatient = (column: PgColumn) => eq(column, patients.id);
  const since = (table: PgTable, patientColumn: PgColumn, at: PgColumn) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(table)
        .where(and(ofPatient(patientColumn), gte(at, cutoff))),
    );
  const viaCondition = (
    table: PgTable,
    conditionColumn: PgColumn,
    at: PgColumn,
  ) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(table)
        .innerJoin(
          clinicalConditions,
          eq(clinicalConditions.id, conditionColumn),
        )
        .where(and(ofPatient(clinicalConditions.patientId), gte(at, cutoff))),
    );
  const outcomeEvaluated = exists(
    db
      .select({ one: sql`1` })
      .from(outcomeEvaluations)
      .innerJoin(
        carePlanOutcomes,
        eq(carePlanOutcomes.id, outcomeEvaluations.outcomeId),
      )
      .innerJoin(carePlans, eq(carePlans.id, carePlanOutcomes.carePlanId))
      .where(
        and(
          ofPatient(carePlans.patientId),
          gte(outcomeEvaluations.evaluatedAt, cutoff),
        ),
      ),
  );
  const interventionPerformed = exists(
    db
      .select({ one: sql`1` })
      .from(interventionRecords)
      .innerJoin(
        carePlanInterventions,
        eq(carePlanInterventions.id, interventionRecords.interventionId),
      )
      .innerJoin(carePlans, eq(carePlans.id, carePlanInterventions.carePlanId))
      .where(
        and(
          ofPatient(carePlans.patientId),
          gte(interventionRecords.performedAt, cutoff),
        ),
      ),
  );
  return sql`(${or(
    since(appointments, appointments.patientId, appointments.endsAt),
    since(anamneses, anamneses.patientId, anamneses.updatedAt),
    since(evolutionNotes, evolutionNotes.patientId, evolutionNotes.createdAt),
    since(
      clinicalConditions,
      clinicalConditions.patientId,
      clinicalConditions.createdAt,
    ),
    since(carePlans, carePlans.patientId, carePlans.createdAt),
    viaCondition(
      conditionAssessments,
      conditionAssessments.conditionId,
      conditionAssessments.createdAt,
    ),
    viaCondition(
      conditionPhotos,
      conditionPhotos.conditionId,
      conditionPhotos.createdAt,
    ),
    outcomeEvaluated,
    interventionPerformed,
  )})`;
}

function conditionsOf(tx: Tx, clinicId: string, patientId: string) {
  return tx
    .select({ id: clinicalConditions.id })
    .from(clinicalConditions)
    .where(
      and(
        eq(clinicalConditions.clinicId, clinicId),
        eq(clinicalConditions.patientId, patientId),
      ),
    );
}

/** Anamnese, SOAP, condições, avaliações e observação das fotos. */
async function clearClinicalText(tx: Tx, clinicId: string, patientId: string) {
  const ofPatient = <T extends { clinicId: PgColumn; patientId: PgColumn }>(
    table: T,
  ) => and(eq(table.clinicId, clinicId), eq(table.patientId, patientId));
  await tx
    .update(anamneses)
    .set({
      comorbidities: '',
      allergies: '',
      medications: '',
      surgicalHistory: '',
      notes: '',
    })
    .where(ofPatient(anamneses));
  await tx
    .update(evolutionNotes)
    .set({ subjective: '', objective: '', assessment: '', plan: '' })
    .where(ofPatient(evolutionNotes));
  await tx
    .update(clinicalConditions)
    .set({ title: ANONYMIZED_CONDITION_TITLE, notes: null })
    .where(ofPatient(clinicalConditions));
  const conditions = conditionsOf(tx, clinicId, patientId);
  await tx
    .update(conditionAssessments)
    .set({ notes: null, skinCondition: null, complications: null })
    .where(inArray(conditionAssessments.conditionId, conditions));
  await tx
    .update(conditionPhotos)
    .set({ patientNote: null })
    .where(inArray(conditionPhotos.conditionId, conditions));
}

/** Texto livre do plano de cuidados (SAE). */
async function clearCarePlanText(tx: Tx, clinicId: string, patientId: string) {
  const plans = tx
    .select({ id: carePlans.id })
    .from(carePlans)
    .where(
      and(eq(carePlans.clinicId, clinicId), eq(carePlans.patientId, patientId)),
    );
  await tx
    .update(carePlanDiagnoses)
    .set({ relatedFactors: null, definingCharacteristics: null })
    .where(inArray(carePlanDiagnoses.carePlanId, plans));
  await tx
    .update(outcomeEvaluations)
    .set({ notes: null })
    .where(
      inArray(
        outcomeEvaluations.outcomeId,
        tx
          .select({ id: carePlanOutcomes.id })
          .from(carePlanOutcomes)
          .where(inArray(carePlanOutcomes.carePlanId, plans)),
      ),
    );
  await tx
    .update(interventionRecords)
    .set({ notes: null })
    .where(
      inArray(
        interventionRecords.interventionId,
        tx
          .select({ id: carePlanInterventions.id })
          .from(carePlanInterventions)
          .where(inArray(carePlanInterventions.carePlanId, plans)),
      ),
    );
}

/** Observações da agenda, motivo do retorno e IP dos consentimentos. */
async function clearSchedulingText(
  tx: Tx,
  clinicId: string,
  patientId: string,
) {
  const ofPatient = <T extends { clinicId: PgColumn; patientId: PgColumn }>(
    table: T,
  ) => and(eq(table.clinicId, clinicId), eq(table.patientId, patientId));
  await tx
    .update(appointments)
    .set({ notes: null, cancelReason: null })
    .where(ofPatient(appointments));
  await tx.update(followUps).set({ reason: '' }).where(ofPatient(followUps));
  await tx
    .update(consentRecords)
    .set({ ipAddress: null })
    .where(ofPatient(consentRecords));
  await tx
    .update(partnerShareConsents)
    .set({ ipAddress: null })
    .where(ofPatient(partnerShareConsents));
}

/** Tira e-mail e senha, derruba sessões e apaga tokens e segundo fator. */
async function anonymizeAccounts(
  tx: Tx,
  clinicId: string,
  ids: string[],
  now: Date,
) {
  if (ids.length === 0) return;
  await tx
    .update(userAccounts)
    .set({
      email: sql`'anonimizado+' || ${userAccounts.id} || '@anonimizado.invalid'`,
      passwordHash: ANONYMIZED_PASSWORD_HASH,
      active: false,
      sessionVersion: sql`${userAccounts.sessionVersion} + 1`,
      deactivatedAt: sql`coalesce(${userAccounts.deactivatedAt}, ${now.toISOString()}::timestamptz)`,
      anonymizedAt: now,
    })
    .where(
      and(eq(userAccounts.clinicId, clinicId), inArray(userAccounts.id, ids)),
    );
  await tx.delete(authTokens).where(inArray(authTokens.accountId, ids));
  await tx
    .delete(mfaRecoveryCodes)
    .where(inArray(mfaRecoveryCodes.accountId, ids));
  await tx.delete(userMfa).where(inArray(userMfa.accountId, ids));
}
