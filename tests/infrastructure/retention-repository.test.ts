import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import {
  ANONYMIZED_CONDITION_TITLE,
  ANONYMIZED_MARKER,
  ANONYMIZED_PASSWORD_HASH,
  ANONYMIZED_PATIENT_NAME,
  anonymizedEmail,
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

    expect(await repo.anonymizePatient(patientId, NOW)).toBe(1);
    expect(await repo.anonymizePatient(patientId, NOW)).toBe(0);

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
    await repo.anonymizePatient(patientId, NOW);

    const pending = (await repo.findPendingPhotos(1000)).map((p) => p.id);
    expect(pending).toContain(photoId);
    expect(pending).not.toContain(alivePhoto);

    await repo.markPhotoAnonymized(photoId, NOW);
    expect((await repo.findPendingPhotos(1000)).map((p) => p.id)).not.toContain(
      photoId,
    );
  });

  it('Dado paciente de outra clínica, Quando anonimiza pelo escopo errado, Então nada muda', async () => {
    const patientId = await insertPatient(OTHER);
    expect(await repo.anonymizePatient(patientId, NOW)).toBe(0);
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
  it('Dadas contas inativas, Quando anonimiza, Então só equipe e paciente desativados antes do corte; parceiro e ativos ficam', async () => {
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
    const partner = await insertAccount({
      role: 'partner',
      active: false,
      deactivatedAt: OLD,
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
    expect(row(partner)?.anonymizedAt).toBeNull();
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
