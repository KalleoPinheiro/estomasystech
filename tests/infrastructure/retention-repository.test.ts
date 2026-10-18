import { eq, inArray } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import {
  ANONYMIZED_CONDITION_TITLE,
  ANONYMIZED_INVOICE_DESCRIPTION,
  ANONYMIZED_MARKER,
  ANONYMIZED_PASSWORD_HASH,
  ANONYMIZED_PATIENT_NAME,
  anonymizedEmail,
  retentionCutoff,
} from '@/domain/retention/retention-policy';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleClinicRepository } from '@/infrastructure/persistence/drizzle/drizzle-clinic-repository';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import {
  DrizzleRetentionRepository,
  RETENTION_NEEDS_CLINIC_SCOPE,
} from '@/infrastructure/persistence/drizzle/drizzle-retention-repository';
import { DrizzleWaitlistRepository } from '@/infrastructure/persistence/drizzle/drizzle-waitlist-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';
const OTHER = 'ret-clinic-b';
const NOW = new Date('2026-10-11T12:00:00Z');
const CUTOFF_20 = new Date('2006-10-11T12:00:00Z');
const CUTOFF_5 = new Date('2021-10-11T12:00:00Z');
const CUTOFF_2 = new Date('2024-10-11T12:00:00Z');
const OLD = new Date('2000-01-01T12:00:00Z');
const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

let db: PgliteDatabase<typeof schema>;
let appDb: AppDb;
let repo: DrizzleRetentionRepository;
let sequence = 0;
const nextId = (prefix: string) => {
  sequence += 1;
  return `${prefix}-${sequence}`;
};

async function insertPatient(clinicId: string, createdAt = OLD) {
  const id = nextId('pat');
  await db.insert(schema.patients).values({
    id,
    clinicId,
    fullName: `Maria ${id}`,
    email: `${id}@x.com`,
    phone: '11999990000',
    birthDate: new Date('1950-07-15T00:00:00Z'),
    notes: 'observação com nome',
    createdAt,
  });
  return id;
}

/** Prontuário completo do paciente, tudo na data `at`. */
async function seedRecord(clinicId: string, patientId: string, at = OLD) {
  const conditionId = nextId('cond');
  const planId = nextId('plan');
  const outcomeId = nextId('out');
  const interventionId = nextId('int');
  const photoId = nextId('photo');
  await db.insert(schema.anamneses).values({
    patientId,
    clinicId,
    comorbidities: 'DM',
    allergies: 'dipirona',
    medications: 'metformina',
    surgicalHistory: 'colectomia',
    notes: 'nota',
    updatedAt: at,
  });
  await db.insert(schema.evolutionNotes).values({
    id: nextId('evo'),
    clinicId,
    patientId,
    subjective: 'S',
    objective: 'O',
    assessment: 'A',
    plan: 'P',
    createdAt: at,
  });
  await db.insert(schema.clinicalConditions).values({
    id: conditionId,
    clinicId,
    patientId,
    kind: 'wound',
    title: 'Úlcera da Maria',
    status: 'active',
    notes: 'nota',
    createdAt: at,
  });
  await db.insert(schema.conditionAssessments).values({
    id: nextId('ass'),
    clinicId,
    conditionId,
    lengthMm: 30,
    widthMm: 20,
    notes: 'nota',
    skinCondition: 'pele',
    complications: 'texto',
    complicationCodes: 'bleeding',
    createdAt: at,
  });
  await db.insert(schema.conditionPhotos).values({
    id: photoId,
    clinicId,
    conditionId,
    contentType: 'image/jpeg',
    sizeBytes: 123,
    origin: 'patient',
    patientNote: 'doendo',
    createdAt: at,
  });
  await db.insert(schema.carePlans).values({
    id: planId,
    clinicId,
    patientId,
    status: 'active',
    createdAt: at,
  });
  await db.insert(schema.carePlanDiagnoses).values({
    id: nextId('dx'),
    clinicId,
    carePlanId: planId,
    diagnosisCode: '00046',
    type: 'actual',
    relatedFactors: 'fator',
    definingCharacteristics: 'característica',
    createdAt: at,
  });
  await db.insert(schema.carePlanOutcomes).values({
    id: outcomeId,
    clinicId,
    carePlanId: planId,
    outcomeCode: '1103',
    baselineScore: 2,
    targetScore: 4,
    createdAt: at,
  });
  await db.insert(schema.outcomeEvaluations).values({
    id: nextId('eval'),
    clinicId,
    outcomeId,
    score: 3,
    notes: 'nota',
    evaluatedAt: at,
  });
  await db.insert(schema.carePlanInterventions).values({
    id: interventionId,
    clinicId,
    carePlanId: planId,
    interventionCode: '3660',
    frequency: 'daily',
    priority: 'high',
    createdAt: at,
  });
  await db.insert(schema.interventionRecords).values({
    id: nextId('rec'),
    clinicId,
    interventionId,
    notes: 'nota',
    performedAt: at,
  });
  await db.insert(schema.appointments).values({
    id: nextId('appt'),
    clinicId,
    patientId,
    startsAt: at,
    endsAt: ms(at, 3_600_000),
    procedure: 'Curativo',
    priceCents: 10_000,
    status: 'cancelled',
    notes: 'nota',
    cancelReason: 'motivo',
    createdAt: at,
  });
  await db.insert(schema.followUps).values({
    id: nextId('fu'),
    clinicId,
    patientId,
    dueDate: at,
    reason: 'retorno da Maria',
    status: 'done',
    createdAt: at,
  });
  await db.insert(schema.consentRecords).values({
    id: nextId('consent'),
    clinicId,
    patientId,
    textHash: 'hash',
    ipAddress: '10.0.0.1',
    acceptedAt: at,
  });
  await db.insert(schema.dataSubjectRequests).values({
    id: nextId('dsr'),
    clinicId,
    patientId,
    kind: 'correction',
    details: TEST_CIPHER.encrypt('telefone da Maria'),
    status: 'accepted',
    resolution: TEST_CIPHER.encrypt('corrigido'),
    createdAt: at,
    resolvedAt: at,
  });
  return { conditionId, photoId };
}

async function insertAccount(
  values: Partial<typeof schema.userAccounts.$inferInsert> & {
    role: string;
  },
) {
  const id = nextId('acc');
  await db.insert(schema.userAccounts).values({
    id,
    clinicId: CLINIC,
    email: `${id}@x.com`,
    passwordHash: 'scrypt$1$salt$hash',
    createdAt: OLD,
    ...values,
  });
  return id;
}

beforeAll(async () => {
  const client = await createPgliteFromTemplate();
  db = drizzle(client, { schema });
  appDb = db as unknown as AppDb;
  repo = new DrizzleRetentionRepository(appDb, CLINIC);
  await new DrizzleClinicRepository(appDb).create(
    Clinic.restore({
      id: OTHER,
      name: 'Clínica B',
      createdBy: 'test',
      createdAt: new Date(),
    }),
  );
});

describe('Feature: Retenção do prontuário — 20 anos após a última atividade (#294, RET-03)', () => {
  it('Dado paciente sem atividade desde antes do corte, Então entra; com qualquer registro a partir do corte, Então não', async () => {
    const stale = await insertPatient(CLINIC);
    await seedRecord(CLINIC, stale);
    const atCutoff = await insertPatient(CLINIC);
    await seedRecord(CLINIC, atCutoff, CUTOFF_20);
    // A consulta termina 1 h depois: é o fim dela que conta.
    const justBefore = await insertPatient(CLINIC);
    await seedRecord(CLINIC, justBefore, ms(CUTOFF_20, -3_600_001));
    const endsAtCutoff = await insertPatient(CLINIC);
    await seedRecord(CLINIC, endsAtCutoff, ms(CUTOFF_20, -3_600_000));
    const recentPhoto = await insertPatient(CLINIC);
    const { conditionId } = await seedRecord(CLINIC, recentPhoto);
    await db.insert(schema.conditionPhotos).values({
      id: nextId('photo'),
      clinicId: CLINIC,
      conditionId,
      contentType: 'image/jpeg',
      sizeBytes: 1,
      createdAt: NOW,
    });
    const futureAppointment = await insertPatient(CLINIC);
    await db.insert(schema.appointments).values({
      id: nextId('appt'),
      clinicId: CLINIC,
      patientId: futureAppointment,
      startsAt: ms(NOW, 86_400_000),
      endsAt: ms(NOW, 90_000_000),
      procedure: 'Curativo',
      priceCents: 1,
      status: 'scheduled',
      createdAt: OLD,
    });
    const newcomer = await insertPatient(CLINIC, NOW);
    const otherClinic = await insertPatient(OTHER);

    const due = await repo.findPatientsDue(CUTOFF_20, 1000);

    expect(due).toContain(stale);
    expect(due).toContain(justBefore);
    expect(due).not.toContain(atCutoff);
    expect(due).not.toContain(endsAtCutoff);
    expect(due).not.toContain(recentPhoto);
    expect(due).not.toContain(futureAppointment);
    expect(due).not.toContain(newcomer);
    expect(due).not.toContain(otherClinic);
  });

  it.each([
    'evolution',
    'assessment',
    'outcome',
    'intervention',
    'carePlan',
    'anamnesis',
  ] as const)(
    'Dado só um registro recente de %s, Então o paciente não entra',
    async (kind) => {
      const patientId = await insertPatient(CLINIC);
      const { conditionId } = await seedRecord(CLINIC, patientId);
      const plan = await db
        .select()
        .from(schema.carePlans)
        .where(eq(schema.carePlans.patientId, patientId));
      const planId = plan[0].id;
      const outcome = await db
        .select()
        .from(schema.carePlanOutcomes)
        .where(eq(schema.carePlanOutcomes.carePlanId, planId));
      const intervention = await db
        .select()
        .from(schema.carePlanInterventions)
        .where(eq(schema.carePlanInterventions.carePlanId, planId));
      const recent = {
        evolution: () =>
          db.insert(schema.evolutionNotes).values({
            id: nextId('evo'),
            clinicId: CLINIC,
            patientId,
            createdAt: NOW,
          }),
        assessment: () =>
          db.insert(schema.conditionAssessments).values({
            id: nextId('ass'),
            clinicId: CLINIC,
            conditionId,
            createdAt: NOW,
          }),
        outcome: () =>
          db.insert(schema.outcomeEvaluations).values({
            id: nextId('eval'),
            clinicId: CLINIC,
            outcomeId: outcome[0].id,
            score: 1,
            evaluatedAt: NOW,
          }),
        intervention: () =>
          db.insert(schema.interventionRecords).values({
            id: nextId('rec'),
            clinicId: CLINIC,
            interventionId: intervention[0].id,
            performedAt: NOW,
          }),
        carePlan: () =>
          db.insert(schema.carePlans).values({
            id: nextId('plan'),
            clinicId: CLINIC,
            patientId,
            status: 'active',
            createdAt: NOW,
          }),
        anamnesis: () =>
          db
            .update(schema.anamneses)
            .set({ updatedAt: NOW })
            .where(eq(schema.anamneses.patientId, patientId)),
      };
      await recent[kind]();

      expect(await repo.findPatientsDue(CUTOFF_20, 1000)).not.toContain(
        patientId,
      );
    },
  );

  it('Dado paciente vencido, Quando anonimiza, Então tira identificação e texto livre e mantém o dado estruturado; de novo, Então nada muda', async () => {
    const patientId = await insertPatient(CLINIC);
    const { conditionId, photoId } = await seedRecord(CLINIC, patientId);
    const portal = await insertAccount({
      role: 'patient',
      patientId,
      active: true,
    });
    await db.insert(schema.authTokens).values({
      id: nextId('tok'),
      accountId: portal,
      purpose: 'reset',
      secretHash: nextId('hash'),
      expiresAt: NOW,
      createdAt: NOW,
    });

    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(1);
    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(0);

    const [patient] = await db
      .select()
      .from(schema.patients)
      .where(eq(schema.patients.id, patientId));
    expect(patient).toMatchObject({
      fullName: ANONYMIZED_PATIENT_NAME,
      email: anonymizedEmail(patientId),
      phone: '',
      notes: null,
      active: false,
      anonymizedAt: NOW,
      birthDate: new Date('1950-01-01T00:00:00Z'),
    });
    const [anamnesis] = await db
      .select()
      .from(schema.anamneses)
      .where(eq(schema.anamneses.patientId, patientId));
    expect(anamnesis).toMatchObject({
      comorbidities: '',
      allergies: '',
      medications: '',
      surgicalHistory: '',
      notes: '',
    });
    const [evolution] = await db
      .select()
      .from(schema.evolutionNotes)
      .where(eq(schema.evolutionNotes.patientId, patientId));
    expect(evolution).toMatchObject({
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
    });
    const [condition] = await db
      .select()
      .from(schema.clinicalConditions)
      .where(eq(schema.clinicalConditions.id, conditionId));
    expect(condition).toMatchObject({
      title: ANONYMIZED_CONDITION_TITLE,
      notes: null,
      kind: 'wound',
      status: 'active',
    });
    const [assessment] = await db
      .select()
      .from(schema.conditionAssessments)
      .where(eq(schema.conditionAssessments.conditionId, conditionId));
    expect(assessment).toMatchObject({
      notes: null,
      skinCondition: null,
      complications: null,
      lengthMm: 30,
      widthMm: 20,
      complicationCodes: 'bleeding',
    });
    const [photo] = await db
      .select()
      .from(schema.conditionPhotos)
      .where(eq(schema.conditionPhotos.id, photoId));
    expect(photo).toMatchObject({
      patientNote: null,
      sizeBytes: 123,
      anonymizedAt: null,
    });
    const [plan] = await db
      .select()
      .from(schema.carePlans)
      .where(eq(schema.carePlans.patientId, patientId));
    const [diagnosis] = await db
      .select()
      .from(schema.carePlanDiagnoses)
      .where(eq(schema.carePlanDiagnoses.carePlanId, plan.id));
    expect(diagnosis).toMatchObject({
      relatedFactors: null,
      definingCharacteristics: null,
      diagnosisCode: '00046',
    });
    const evaluations = await db.select().from(schema.outcomeEvaluations);
    const records = await db.select().from(schema.interventionRecords);
    const [outcome] = await db
      .select()
      .from(schema.carePlanOutcomes)
      .where(eq(schema.carePlanOutcomes.carePlanId, plan.id));
    const [intervention] = await db
      .select()
      .from(schema.carePlanInterventions)
      .where(eq(schema.carePlanInterventions.carePlanId, plan.id));
    expect(
      evaluations.find((row) => row.outcomeId === outcome.id),
    ).toMatchObject({ notes: null, score: 3 });
    expect(
      records.find((row) => row.interventionId === intervention.id),
    ).toMatchObject({ notes: null });
    const [appointment] = await db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.patientId, patientId));
    expect(appointment).toMatchObject({
      notes: null,
      cancelReason: null,
      priceCents: 10_000,
      status: 'cancelled',
    });
    const [followUp] = await db
      .select()
      .from(schema.followUps)
      .where(eq(schema.followUps.patientId, patientId));
    expect(followUp).toMatchObject({ reason: '', status: 'done' });
    const [consent] = await db
      .select()
      .from(schema.consentRecords)
      .where(eq(schema.consentRecords.patientId, patientId));
    expect(consent).toMatchObject({ ipAddress: null, textHash: 'hash' });
    const [dataRequest] = await db
      .select()
      .from(schema.dataSubjectRequests)
      .where(eq(schema.dataSubjectRequests.patientId, patientId));
    expect(dataRequest).toMatchObject({
      details: null,
      resolution: null,
      kind: 'correction',
      status: 'accepted',
    });
    const [account] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, portal));
    expect(account).toMatchObject({
      email: anonymizedEmail(portal),
      passwordHash: ANONYMIZED_PASSWORD_HASH,
      active: false,
      sessionVersion: 1,
      anonymizedAt: NOW,
      patientId,
    });
    expect(
      await db
        .select()
        .from(schema.authTokens)
        .where(eq(schema.authTokens.accountId, portal)),
    ).toEqual([]);
    expect(await repo.findPatientsDue(CUTOFF_20, 1000)).not.toContain(
      patientId,
    );
  });

  it('Dado paciente anonimizado, Quando lista as fotos pendentes e marca, Então a foto sai da lista', async () => {
    const patientId = await insertPatient(CLINIC);
    const { photoId } = await seedRecord(CLINIC, patientId);
    const alive = await insertPatient(CLINIC, NOW);
    const { photoId: alivePhoto } = await seedRecord(CLINIC, alive, NOW);
    await repo.anonymizePatient(patientId, NOW, CUTOFF_20);

    const pending = (await repo.findPendingPhotos(1000)).map((p) => p.id);
    expect(pending).toContain(photoId);
    expect(pending).not.toContain(alivePhoto);

    await repo.markPhotoAnonymized(photoId, NOW);
    expect((await repo.findPendingPhotos(1000)).map((p) => p.id)).not.toContain(
      photoId,
    );
  });

  it('Dado responsável compartilhado (#329), Quando anonimiza um paciente, Então desvincula e o responsável fica; ao anonimizar o último, o cadastro é apagado', async () => {
    const guardianId = nextId('grd');
    await db.insert(schema.guardians).values({
      id: guardianId,
      clinicId: CLINIC,
      fullName: 'Ana Responsável',
      relationship: 'filho',
      phone: '+5511999990000',
      email: 'ana@x.com',
      createdAt: OLD,
    });
    const first = await insertPatient(CLINIC);
    const second = await insertPatient(CLINIC);
    await db
      .update(schema.patients)
      .set({ guardianId })
      .where(inArray(schema.patients.id, [first, second]));
    const guardianRows = () =>
      db
        .select()
        .from(schema.guardians)
        .where(eq(schema.guardians.id, guardianId));
    const linkOf = async (id: string) =>
      (
        await db
          .select({ guardianId: schema.patients.guardianId })
          .from(schema.patients)
          .where(eq(schema.patients.id, id))
      )[0].guardianId;

    expect(await repo.anonymizePatient(first, NOW, CUTOFF_20)).toBe(1);
    expect(await linkOf(first)).toBeNull();
    expect(await linkOf(second)).toBe(guardianId);
    expect(await guardianRows()).toHaveLength(1);

    expect(await repo.anonymizePatient(second, NOW, CUTOFF_20)).toBe(1);
    expect(await linkOf(second)).toBeNull();
    expect(await guardianRows()).toHaveLength(0);
  });

  it('Dado responsável com conta de portal (ADR-027), Quando anonimiza o último paciente, Então a conta é anonimizada e o cadastro apagado', async () => {
    const guardianId = nextId('grd');
    await db.insert(schema.guardians).values({
      id: guardianId,
      clinicId: CLINIC,
      fullName: 'Ana Responsável',
      relationship: 'filho',
      phone: '+5511999990000',
      email: 'ana@x.com',
      createdAt: OLD,
    });
    const accountId = nextId('acc');
    await db.insert(schema.userAccounts).values({
      id: accountId,
      clinicId: CLINIC,
      email: `${accountId}@x.com`,
      passwordHash: 'scrypt$x',
      role: 'guardian',
      guardianId,
      active: true,
      createdAt: OLD,
    });
    const only = await insertPatient(CLINIC);
    await db
      .update(schema.patients)
      .set({ guardianId })
      .where(eq(schema.patients.id, only));

    expect(await repo.anonymizePatient(only, NOW, CUTOFF_20)).toBe(1);

    const [account] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, accountId));
    expect(account.active).toBe(false);
    expect(account.guardianId).toBeNull();
    expect(account.anonymizedAt).not.toBeNull();
    expect(
      await db
        .select()
        .from(schema.guardians)
        .where(eq(schema.guardians.id, guardianId)),
    ).toHaveLength(0);
  });

  it('Dado paciente com atividade nova depois da busca, Quando anonimiza, Então nada muda', async () => {
    const patientId = await insertPatient(CLINIC);
    await seedRecord(CLINIC, patientId);
    expect(await repo.findPatientsDue(CUTOFF_20, 1000)).toContain(patientId);
    await db.insert(schema.evolutionNotes).values({
      id: nextId('evo'),
      clinicId: CLINIC,
      patientId,
      createdAt: NOW,
    });

    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(0);
  });

  it('Dado paciente de outra clínica, Quando anonimiza pelo escopo errado, Então nada muda', async () => {
    const patientId = await insertPatient(OTHER);
    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(0);
  });
});

describe('Feature: Retenção da trilha de auditoria — 5 anos (#294, RET-05)', () => {
  async function insertEvent(clinicId: string | null, occurredAt: Date) {
    const id = nextId('ev');
    await db.insert(schema.auditEvents).values({
      id,
      clinicId,
      actorRole: 'company_admin',
      actorId: 'admin@x.com',
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: 'p-1',
      patientId: 'p-1',
      detail: 'detalhe',
      occurredAt,
    });
    return id;
  }
  const byId = async (id: string) =>
    (
      await db
        .select()
        .from(schema.auditEvents)
        .where(eq(schema.auditEvents.id, id))
    )[0];

  it('Dado eventos da clínica, Quando anonimiza, Então só os anteriores ao corte perdem ator, recurso, paciente e detalhe; de novo, Então 0', async () => {
    const old = await insertEvent(CLINIC, ms(CUTOFF_5, -1));
    const atCutoff = await insertEvent(CLINIC, CUTOFF_5);
    const otherClinic = await insertEvent(OTHER, OLD);
    const platform = await insertEvent(null, OLD);

    expect(await repo.anonymizeAuditEvents(CUTOFF_5)).toBeGreaterThanOrEqual(1);
    expect(await repo.anonymizeAuditEvents(CUTOFF_5)).toBe(0);

    expect(await byId(old)).toMatchObject({
      actorId: ANONYMIZED_MARKER,
      resourceId: ANONYMIZED_MARKER,
      patientId: null,
      detail: null,
      actorRole: 'company_admin',
      action: 'read',
      resourceType: 'anamnesis',
      clinicId: CLINIC,
    });
    expect(await byId(atCutoff)).toMatchObject({ actorId: 'admin@x.com' });
    expect(await byId(otherClinic)).toMatchObject({ actorId: 'admin@x.com' });
    expect(await byId(platform)).toMatchObject({ actorId: 'admin@x.com' });

    const system = new DrizzleRetentionRepository(appDb, null);
    expect(await system.anonymizeAuditEvents(CUTOFF_5)).toBeGreaterThanOrEqual(
      1,
    );
    expect(await byId(platform)).toMatchObject({ actorId: ANONYMIZED_MARKER });
    expect(await byId(otherClinic)).toMatchObject({ actorId: 'admin@x.com' });
  });

  it('Dado evento no último dia do prazo, Quando o job roda nesse dia, Então ele fica; no dia seguinte, sai (#323)', async () => {
    const SP = 'America/Sao_Paulo';
    const other = new DrizzleRetentionRepository(appDb, OTHER);
    const lastDay = await insertEvent(
      OTHER,
      new Date('2021-10-18T23:30:00-03:00'),
    );
    const dayBefore = await insertEvent(
      OTHER,
      new Date('2021-10-17T23:59:00-03:00'),
    );

    await other.anonymizeAuditEvents(
      retentionCutoff(new Date('2026-10-18T23:59:00-03:00'), 5, SP),
    );
    expect(await byId(lastDay)).toMatchObject({ actorId: 'admin@x.com' });
    expect(await byId(dayBefore)).toMatchObject({
      actorId: ANONYMIZED_MARKER,
    });

    await other.anonymizeAuditEvents(
      retentionCutoff(new Date('2026-10-19T00:01:00-03:00'), 5, SP),
    );
    expect(await byId(lastDay)).toMatchObject({ actorId: ANONYMIZED_MARKER });
  });

  it('Dado escopo de sistema, Quando pede prontuário, fila ou contas, Então recusa', async () => {
    const system = new DrizzleRetentionRepository(appDb, null);
    await expect(system.findPatientsDue(CUTOFF_20, 1)).rejects.toThrow(
      RETENTION_NEEDS_CLINIC_SCOPE,
    );
    await expect(system.anonymizeWaitlistEntries(CUTOFF_2)).rejects.toThrow(
      RETENTION_NEEDS_CLINIC_SCOPE,
    );
    await expect(
      system.anonymizeInactiveAccounts(CUTOFF_2, NOW),
    ).rejects.toThrow(RETENTION_NEEDS_CLINIC_SCOPE);
  });
});

describe('Feature: Retenção da lista de espera — 2 anos (#294, RET-06)', () => {
  async function insertEntry(
    patientId: string,
    status: string,
    createdAt: Date,
    resolvedAt: Date | null,
  ) {
    const id = nextId('wl');
    await db.insert(schema.waitlistEntries).values({
      id,
      clinicId: CLINIC,
      patientId,
      fromDate: '2020-01-01',
      toDate: '2020-02-01',
      notes: 'prefere manhã',
      source: 'staff',
      status,
      createdAt,
      resolvedAt,
    });
    return id;
  }

  it('Dada entrada resolvida antes do corte, Então perde paciente e observação e some das leituras; aguardando ou recente, Então fica', async () => {
    const patientId = await insertPatient(CLINIC, NOW);
    const resolved = await insertEntry(
      patientId,
      'removed',
      OLD,
      ms(CUTOFF_2, -1),
    );
    const noResolvedAt = await insertEntry(patientId, 'scheduled', OLD, null);
    const atCutoff = await insertEntry(patientId, 'scheduled', OLD, CUTOFF_2);
    const waiting = await insertEntry(patientId, 'waiting', OLD, null);

    expect(await repo.anonymizeWaitlistEntries(CUTOFF_2)).toBe(2);
    expect(await repo.anonymizeWaitlistEntries(CUTOFF_2)).toBe(0);

    const rows = await db.select().from(schema.waitlistEntries);
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row(resolved)).toMatchObject({
      patientId: null,
      notes: null,
      status: 'removed',
      fromDate: '2020-01-01',
    });
    expect(row(noResolvedAt)).toMatchObject({ patientId: null });
    expect(row(atCutoff)).toMatchObject({ patientId });
    expect(row(waiting)).toMatchObject({ patientId });

    const waitlist = new DrizzleWaitlistRepository(appDb, CLINIC, TEST_CIPHER);
    expect(await waitlist.findById(resolved)).toBeNull();
    expect(await waitlist.findById(waiting)).not.toBeNull();
    expect(
      (await waitlist.findByPatient(patientId)).map((e) => e.id).sort(),
    ).toEqual([atCutoff, waiting].sort());
  });
});

describe('Feature: Retenção de contas inativas — 2 anos após a desativação (#294, RET-07, RET-11)', () => {
  it('Dadas contas inativas, Quando anonimiza, Então só equipe e paciente desativados antes do corte; ativos e os do corte ficam', async () => {
    const staff = await insertAccount({
      role: 'atendente',
      active: false,
      deactivatedAt: ms(CUTOFF_2, -1),
    });
    await db.insert(schema.userMfa).values({
      accountId: staff,
      totpSecret: 'x',
      enrolledAt: OLD,
      lastUsedStep: 0,
    });
    await db.insert(schema.mfaRecoveryCodes).values({
      id: nextId('rc'),
      accountId: staff,
      codeHash: 'h',
      createdAt: OLD,
    });
    const atCutoff = await insertAccount({
      role: 'profissional',
      active: false,
      deactivatedAt: CUTOFF_2,
    });
    const active = await insertAccount({ role: 'company_admin' });

    expect(await repo.anonymizeInactiveAccounts(CUTOFF_2, NOW)).toBe(1);
    expect(await repo.anonymizeInactiveAccounts(CUTOFF_2, NOW)).toBe(0);

    const rows = await db.select().from(schema.userAccounts);
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row(staff)).toMatchObject({
      email: anonymizedEmail(staff),
      passwordHash: ANONYMIZED_PASSWORD_HASH,
      sessionVersion: 1,
      anonymizedAt: NOW,
      role: 'atendente',
      clinicId: CLINIC,
    });
    expect(row(atCutoff)?.anonymizedAt).toBeNull();
    expect(row(active)?.anonymizedAt).toBeNull();
    expect(
      await db
        .select()
        .from(schema.userMfa)
        .where(eq(schema.userMfa.accountId, staff)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(schema.mfaRecoveryCodes)
        .where(eq(schema.mfaRecoveryCodes.accountId, staff)),
    ).toEqual([]);
  });

  it('Dada uma conta, Quando desativa, Então grava a data; salvar de novo inativa a preserva; reativar a limpa', async () => {
    const accounts = new DrizzleUserAccountRepository(appDb, CLINIC);
    const created = UserAccount.create({
      email: 'desativa-294@x.com',
      passwordHash: 'scrypt$1$salt$hash',
      role: 'atendente',
      clinicId: CLINIC,
    });
    const deactivatedAt = async () =>
      (
        await db
          .select()
          .from(schema.userAccounts)
          .where(eq(schema.userAccounts.id, created.id))
      )[0].deactivatedAt;

    await accounts.save(created);
    expect(await deactivatedAt()).toBeNull();

    await accounts.save(created.deactivate());
    const first = await deactivatedAt();
    expect(first).toBeInstanceOf(Date);

    await accounts.save(created.deactivate());
    expect(await deactivatedAt()).toEqual(first);

    await accounts.save(created.deactivate().reactivate());
    expect(await deactivatedAt()).toBeNull();

    const born = UserAccount.restore({
      id: 'acc-born-inactive-294',
      email: 'nasce-inativa-294@x.com',
      passwordHash: 'scrypt$1$salt$hash',
      role: 'atendente',
      clinicId: CLINIC,
      active: false,
      createdAt: NOW,
    });
    await accounts.save(born);
    const [row] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, born.id));
    expect(row.deactivatedAt).toBeInstanceOf(Date);
  });
});

describe('Feature: Retenção restante (#311)', () => {
  const insertEntry = async (
    clinicId: string,
    patientId: string | null,
    values: Partial<typeof schema.waitlistEntries.$inferInsert>,
  ) => {
    const id = nextId('wl311');
    await db.insert(schema.waitlistEntries).values({
      id,
      clinicId,
      patientId,
      fromDate: '2020-01-01',
      toDate: '2020-02-01',
      source: 'staff',
      status: 'waiting',
      createdAt: OLD,
      ...values,
    });
    return id;
  };
  const waitlistRow = async (id: string) =>
    (
      await db
        .select()
        .from(schema.waitlistEntries)
        .where(eq(schema.waitlistEntries.id, id))
    )[0];
  const invoiceRow = async (id: string) =>
    (
      await db.select().from(schema.invoices).where(eq(schema.invoices.id, id))
    )[0];
  const appointmentRow = async (id: string) =>
    (
      await db
        .select()
        .from(schema.appointments)
        .where(eq(schema.appointments.id, id))
    )[0];

  it('RES-01/02: fila "waiting" com o período terminado expira no fim do período; vigente, outra clínica e resolvida ficam; de novo, 0', async () => {
    // Esvazia o que testes anteriores deixaram em "waiting".
    await repo.expireWaitlistEntries('2026-10-11');
    const patientId = await insertPatient(CLINIC, NOW);
    const otherPatient = await insertPatient(OTHER, NOW);
    const ended = await insertEntry(CLINIC, patientId, {
      fromDate: '2026-10-01',
      toDate: '2026-10-10',
    });
    const endsToday = await insertEntry(CLINIC, patientId, {
      fromDate: '2026-10-01',
      toDate: '2026-10-11',
    });
    const future = await insertEntry(CLINIC, patientId, {
      fromDate: '2026-10-20',
      toDate: '2026-11-20',
    });
    const resolved = await insertEntry(CLINIC, patientId, {
      status: 'scheduled',
      toDate: '2026-10-05',
      resolvedAt: new Date('2026-10-03T10:00:00Z'),
    });
    const otherClinic = await insertEntry(OTHER, otherPatient, {
      toDate: '2026-10-05',
    });

    expect(await repo.expireWaitlistEntries('2026-10-11')).toBe(1);
    expect(await repo.expireWaitlistEntries('2026-10-11')).toBe(0);

    const get = waitlistRow;
    expect(await get(ended)).toMatchObject({
      status: 'expired',
      resolvedAt: new Date('2026-10-11T00:00:00Z'),
      patientId,
    });
    expect((await get(endsToday)).status).toBe('waiting');
    expect((await get(future)).status).toBe('waiting');
    expect(await get(resolved)).toMatchObject({
      status: 'scheduled',
      resolvedAt: new Date('2026-10-03T10:00:00Z'),
    });
    expect((await get(otherClinic)).status).toBe('waiting');
    const waitlist = new DrizzleWaitlistRepository(appDb, CLINIC, TEST_CIPHER);
    expect(
      (await waitlist.listWaiting()).map((entry) => entry.id),
    ).not.toContain(ended);
  });

  it('RES-01: a expirada conta os 2 anos do fim do período e é anonimizada como as resolvidas', async () => {
    await repo.expireWaitlistEntries('2026-10-11');
    await repo.anonymizeWaitlistEntries(CUTOFF_2);
    const patientId = await insertPatient(CLINIC, NOW);
    const old = await insertEntry(CLINIC, patientId, {
      toDate: '2024-10-10',
      notes: 'prefere manhã',
    });
    const recent = await insertEntry(CLINIC, patientId, {
      toDate: '2024-10-11',
    });

    expect(await repo.expireWaitlistEntries('2026-10-11')).toBe(2);
    // Fim do período de `old` = 2024-10-11T00:00Z, antes do corte de 2 anos.
    expect(await repo.anonymizeWaitlistEntries(CUTOFF_2)).toBe(1);
    expect(await repo.anonymizeWaitlistEntries(CUTOFF_2)).toBe(0);

    expect(await waitlistRow(old)).toMatchObject({
      status: 'expired',
      patientId: null,
      notes: null,
    });
    expect(await waitlistRow(recent)).toMatchObject({
      status: 'expired',
      patientId,
    });
  });

  it('RES-03: conta de parceiro desativada há mais de 2 anos é anonimizada e solta o vínculo; a do corte e a de outra clínica ficam', async () => {
    const partnerOf = async (clinicId: string) => {
      const id = nextId('par');
      await db.insert(schema.partners).values({
        id,
        clinicId,
        fullName: 'Dra. Parceira',
        email: `${id}@x.com`,
        phone: '11',
        createdAt: OLD,
      });
      return id;
    };
    const partnerId = await partnerOf(CLINIC);
    const atCutoffPartner = await partnerOf(CLINIC);
    const otherPartner = await partnerOf(OTHER);
    const due = await insertAccount({
      role: 'partner',
      partnerId,
      active: false,
      deactivatedAt: ms(CUTOFF_2, -1),
    });
    const atCutoff = await insertAccount({
      role: 'partner',
      partnerId: atCutoffPartner,
      active: false,
      deactivatedAt: CUTOFF_2,
    });
    const other = await insertAccount({
      clinicId: OTHER,
      role: 'partner',
      partnerId: otherPartner,
      active: false,
      deactivatedAt: OLD,
    });

    expect(await repo.anonymizeInactiveAccounts(CUTOFF_2, NOW)).toBe(1);
    expect(await repo.anonymizeInactiveAccounts(CUTOFF_2, NOW)).toBe(0);

    const rows = await db.select().from(schema.userAccounts);
    const row = (id: string) => rows.find((r) => r.id === id);
    expect(row(due)).toMatchObject({
      email: anonymizedEmail(due),
      passwordHash: ANONYMIZED_PASSWORD_HASH,
      partnerId: null,
      anonymizedAt: NOW,
      role: 'partner',
    });
    expect(row(atCutoff)).toMatchObject({
      partnerId: atCutoffPartner,
      anonymizedAt: null,
    });
    expect(row(other)).toMatchObject({
      partnerId: otherPartner,
      anonymizedAt: null,
    });
    // O cadastro do parceiro não muda (pergunta aberta na spec).
    expect(
      (
        await db
          .select()
          .from(schema.partners)
          .where(eq(schema.partners.id, partnerId))
      )[0].fullName,
    ).toBe('Dra. Parceira');
    // Convite novo para o mesmo parceiro: o vínculo único está livre.
    await expect(
      insertAccount({ role: 'partner', partnerId }),
    ).resolves.toBeTruthy();
  });

  it('RES-04: ao anonimizar o paciente, descrição e motivo do desconto das faturas saem; valores, datas e status ficam; outro paciente não muda', async () => {
    const patientId = await insertPatient(CLINIC);
    const keeper = await insertPatient(CLINIC, NOW);
    const invoice = (id: string, owner: string, extra = {}) =>
      db.insert(schema.invoices).values({
        id,
        clinicId: CLINIC,
        patientId: owner,
        description: 'Curativo de lesão da Maria',
        amountCents: 15000,
        status: 'paid',
        issuedAt: OLD,
        paidAt: OLD,
        paymentMethod: 'pix',
        discountCents: 1000,
        discountReason: 'amiga da família',
        ...extra,
      });
    const own = nextId('inv');
    const ownNoDiscount = nextId('inv');
    const foreign = nextId('inv');
    await invoice(own, patientId);
    await invoice(ownNoDiscount, patientId, {
      discountCents: 0,
      discountReason: null,
      status: 'cancelled',
      paidAt: null,
      paymentMethod: null,
    });
    await invoice(foreign, keeper);
    await db.insert(schema.invoicePayments).values({
      id: nextId('pay'),
      clinicId: CLINIC,
      invoiceId: own,
      amountCents: 14000,
      method: 'pix',
      paidAt: OLD,
      payerName: 'João Pagador',
      payerCpf: 'v1.cifrado',
    });
    const foreignPayment = nextId('pay');
    await db.insert(schema.invoicePayments).values({
      id: foreignPayment,
      clinicId: CLINIC,
      invoiceId: foreign,
      amountCents: 14000,
      method: 'pix',
      paidAt: OLD,
      payerName: 'Outro Pagador',
      payerCpf: 'v1.cifrado',
    });
    await db
      .update(schema.patients)
      .set({ cpf: 'v1.cifrado' })
      .where(eq(schema.patients.id, patientId));

    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(1);
    const [anonymized] = await db
      .select({ cpf: schema.patients.cpf })
      .from(schema.patients)
      .where(eq(schema.patients.id, patientId));
    expect(anonymized.cpf).toBeNull();
    const [kept] = await db
      .select()
      .from(schema.invoicePayments)
      .where(eq(schema.invoicePayments.id, foreignPayment));
    expect(kept).toMatchObject({
      payerName: 'Outro Pagador',
      payerCpf: 'v1.cifrado',
    });
    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(0);

    const get = invoiceRow;
    expect(await get(own)).toMatchObject({
      description: ANONYMIZED_INVOICE_DESCRIPTION,
      discountReason: null,
      amountCents: 15000,
      discountCents: 1000,
      status: 'paid',
      paymentMethod: 'pix',
      issuedAt: OLD,
      paidAt: OLD,
    });
    expect(await get(ownNoDiscount)).toMatchObject({
      description: ANONYMIZED_INVOICE_DESCRIPTION,
      status: 'cancelled',
    });
    expect(await get(foreign)).toMatchObject({
      description: 'Curativo de lesão da Maria',
      discountReason: 'amiga da família',
    });
    const payments = await db
      .select()
      .from(schema.invoicePayments)
      .where(eq(schema.invoicePayments.invoiceId, own));
    expect(payments).toHaveLength(1);
    expect(payments[0].amountCents).toBe(14000);
    // Quem pagou no lugar do paciente sai junto com ele; o valor fica.
    expect(payments[0].payerName).toBeNull();
    expect(payments[0].payerCpf).toBeNull();
  });

  it('RES-05/09: eventos do Google Agenda de paciente anonimizado ficam pendentes até limpar o id; só da própria clínica', async () => {
    const patientId = await insertPatient(CLINIC);
    const keeper = await insertPatient(CLINIC, NOW);
    const otherPatient = await insertPatient(OTHER);
    const appointment = async (
      clinicId: string,
      owner: string,
      googleEventId: string | null,
    ) => {
      const id = nextId('apt');
      await db.insert(schema.appointments).values({
        id,
        clinicId,
        patientId: owner,
        startsAt: OLD,
        endsAt: ms(OLD, 3_600_000),
        procedure: 'Curativo',
        priceCents: 10000,
        status: 'completed',
        googleEventId,
        createdAt: OLD,
      });
      return id;
    };
    const withEvent = await appointment(CLINIC, patientId, 'g-own');
    const withoutEvent = await appointment(CLINIC, patientId, null);
    const keeperAppt = await appointment(CLINIC, keeper, 'g-keeper');
    const otherAppt = await appointment(OTHER, otherPatient, 'g-other');

    // Antes de anonimizar o paciente, nada está pendente.
    expect(await repo.findPendingCalendarEvents(10)).toEqual([]);
    expect(await repo.anonymizePatient(patientId, NOW, CUTOFF_20)).toBe(1);
    await new DrizzleRetentionRepository(appDb, OTHER).anonymizePatient(
      otherPatient,
      NOW,
      CUTOFF_20,
    );

    expect(await repo.findPendingCalendarEvents(10)).toEqual([
      { appointmentId: withEvent, googleEventId: 'g-own' },
    ]);
    expect(await repo.findPendingCalendarEvents(0)).toEqual([]);

    await repo.markCalendarEventRemoved(withEvent);
    // Escopo errado não limpa o id da outra clínica.
    await repo.markCalendarEventRemoved(otherAppt);

    expect(await repo.findPendingCalendarEvents(10)).toEqual([]);
    const get = appointmentRow;
    expect((await get(withEvent)).googleEventId).toBeNull();
    expect((await get(withoutEvent)).googleEventId).toBeNull();
    expect((await get(keeperAppt)).googleEventId).toBe('g-keeper');
    expect((await get(otherAppt)).googleEventId).toBe('g-other');
    expect(
      await new DrizzleRetentionRepository(
        appDb,
        OTHER,
      ).findPendingCalendarEvents(10),
    ).toEqual([{ appointmentId: otherAppt, googleEventId: 'g-other' }]);
  });

  it('Dado escopo de sistema, Quando pede expirar a fila ou os eventos, Então recusa', async () => {
    const system = new DrizzleRetentionRepository(appDb, null);

    await expect(system.expireWaitlistEntries('2026-10-11')).rejects.toThrow(
      RETENTION_NEEDS_CLINIC_SCOPE,
    );
    await expect(system.findPendingCalendarEvents(1)).rejects.toThrow(
      RETENTION_NEEDS_CLINIC_SCOPE,
    );
    await expect(system.markCalendarEventRemoved('x')).rejects.toThrow(
      RETENTION_NEEDS_CLINIC_SCOPE,
    );
  });
});
