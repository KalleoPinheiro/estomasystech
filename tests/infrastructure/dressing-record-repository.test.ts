import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type DressingContent,
  DressingRecord,
} from '@/domain/clinical/dressing-record';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleDressingRecordRepository } from '@/infrastructure/persistence/drizzle/drizzle-dressing-record-repository';
import { DrizzleRetentionRepository } from '@/infrastructure/persistence/drizzle/drizzle-retention-repository';
import { reencryptClinicalData } from '@/infrastructure/persistence/drizzle/reencrypt-clinical-data';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { DataCipher } from '@/lib/data-cipher';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * Registro do curativo em etapas (#963, T1): as etapas vão cifradas num JSON só,
 * voltam iguais, ficam no escopo da empresa, contam como atividade clínica para
 * a retenção, saem na anonimização e entram na recifra da chave.
 */

const CLINIC = 'legacy-clinic';
const OLD = new Date('2000-01-01T12:00:00Z');
const NOW = new Date('2026-10-11T12:00:00Z');
const CUTOFF_20 = new Date('2006-10-11T12:00:00Z');

let db: PgliteDatabase<typeof schema>;
let appDb: AppDb;
let sequence = 0;
const nextId = (prefix: string) => {
  sequence += 1;
  return `${prefix}-${sequence}`;
};

const content: DressingContent = {
  painBefore: 6,
  removal: 'Removida com soro morno',
  cleansingMethod: 'Irrigação',
  cleansingSolution: 'PHMB',
  debridementType: 'Instrumental conservador',
  debridementResult: 'Esfacelo removido',
  adjuvantTherapy: null,
  periwoundProtection: 'Película de polímero',
  primaryCover: 'Hidrofibra com prata',
  secondaryCover: 'Espuma',
  fixation: 'Atadura',
  guidance: 'Elevar o membro',
  painAfter: 2,
  nextChangeOn: '2026-10-14',
};

async function seedAppointment() {
  const patientId = nextId('pat');
  await db.insert(schema.patients).values({
    id: patientId,
    clinicId: CLINIC,
    fullName: 'Maria Sigilosa',
    email: `${patientId}@x.com`,
    phone: '11999990000',
    createdAt: OLD,
  });
  const appointmentId = nextId('appt');
  await db.insert(schema.appointments).values({
    id: appointmentId,
    clinicId: CLINIC,
    patientId,
    startsAt: OLD,
    endsAt: new Date(OLD.getTime() + 3_600_000),
    procedure: 'Curativo',
    priceCents: 10_000,
    status: 'completed',
    createdAt: OLD,
  });
  return { patientId, appointmentId };
}

const recordFor = (appointmentId: string, patientId: string) =>
  DressingRecord.create({ patientId, appointmentId, content });

beforeAll(async () => {
  db = drizzle(await createPgliteFromTemplate(), { schema });
  appDb = db as unknown as AppDb;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Feature: persistência do curativo em etapas (#963)', () => {
  it('Dado curativo salvo, Quando lê pela consulta, Então volta igual e a coluna guarda só cifra', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    const record = recordFor(appointmentId, patientId);

    await repo.save(record);

    const [found] = await repo.findByAppointmentId(appointmentId);
    expect(found?.id).toBe(record.id);
    expect(found?.content).toEqual(content);
    expect(found?.patientId).toBe(patientId);
    expect(found?.appointmentId).toBe(appointmentId);
    expect(found?.conditionId).toBeNull();
    expect(found?.professionalId).toBeNull();
    expect(found?.createdAt).toEqual(record.createdAt);
    const [row] = await db
      .select()
      .from(schema.dressingRecords)
      .where(eq(schema.dressingRecords.id, record.id));
    expect(row?.clinicId).toBe(CLINIC);
    expect(row?.content).not.toContain('Hidrofibra');
    expect(row?.content).not.toContain('PHMB');
  });

  it('Dado dois curativos, Quando lista, Então a consulta vem do mais antigo e o paciente do mais novo; outra empresa não vê', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    const older = recordFor(appointmentId, patientId);
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    const newer = recordFor(appointmentId, patientId);
    vi.useRealTimers();
    await repo.save(newer);
    await repo.save(older);
    const other = new DrizzleDressingRecordRepository(
      appDb,
      'outra-clinica',
      TEST_CIPHER,
    );

    const byAppointment = await repo.findByAppointmentId(appointmentId);
    const byPatient = await repo.findByPatientId(patientId);

    expect(byAppointment.map((item) => item.id)).toEqual([older.id, newer.id]);
    expect(byPatient.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(await repo.findByPatientId('outro-paciente')).toEqual([]);
    expect(await repo.findByAppointmentId('outra-consulta')).toEqual([]);
    expect(await other.findByPatientId(patientId)).toEqual([]);
    expect(await other.findByAppointmentId(appointmentId)).toEqual([]);
  });

  it('Dado ferida e autor, Quando salva, Então ficam ligados ao registro', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    const conditionId = nextId('cond');
    await db.insert(schema.clinicalConditions).values({
      id: conditionId,
      clinicId: CLINIC,
      patientId,
      kind: 'wound',
      title: 'Úlcera venosa',
      status: 'active',
      createdAt: OLD,
    });
    const professionalId = nextId('prof');
    await db.insert(schema.professionals).values({
      id: professionalId,
      clinicId: CLINIC,
      fullName: 'Enf. Ana',
      createdAt: OLD,
    });
    const record = DressingRecord.create({
      patientId,
      appointmentId,
      conditionId,
      professionalId,
      content,
    });

    await repo.save(record);

    const [found] = await repo.findByAppointmentId(appointmentId);
    expect(found?.conditionId).toBe(conditionId);
    expect(found?.professionalId).toBe(professionalId);
  });

  it('Dado registro sem etapas (restaurado depois da anonimização), Quando salva, Então grava a coluna nula', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    const record = DressingRecord.restore({
      id: nextId('cur'),
      patientId,
      appointmentId,
      createdAt: OLD,
      content: null,
    });

    await repo.save(record);

    const [row] = await db
      .select()
      .from(schema.dressingRecords)
      .where(eq(schema.dressingRecords.id, record.id));
    expect(row?.content).toBeNull();
    const [found] = await repo.findByAppointmentId(appointmentId);
    expect(found?.content).toBeNull();
  });

  it('Dado escopo de sistema, Quando salva, Então recusa', async () => {
    const repo = new DrizzleDressingRecordRepository(appDb, null, TEST_CIPHER);

    await expect(repo.save(recordFor('c', 'p'))).rejects.toThrow(
      'Papel de sistema não pode salvar curativo (somente leitura cross-empresa)',
    );
  });

  it('Dado curativo recente num paciente antigo, Quando a retenção procura vencidos, Então ele não vence', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const retention = new DrizzleRetentionRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const quiet = await seedAppointment();
    const active = await seedAppointment();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2020-01-01T10:00:00Z'));
    const recent = recordFor(active.appointmentId, active.patientId);
    vi.useRealTimers();
    await repo.save(recent);

    const due = await retention.findPatientsDue(CUTOFF_20, 10_000);

    expect(due).toContain(quiet.patientId);
    expect(due).not.toContain(active.patientId);
  });

  it('Dado paciente anonimizado pela retenção, Quando lê o curativo, Então o registro fica e as etapas saem', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    // Curativo antigo: o paciente está sem atividade desde o corte, então a retenção o anonimiza.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(OLD);
    const record = recordFor(appointmentId, patientId);
    vi.useRealTimers();
    await repo.save(record);
    const retention = new DrizzleRetentionRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );

    await retention.anonymizePatient(patientId, NOW, CUTOFF_20);

    const [found] = await repo.findByAppointmentId(appointmentId);
    expect(found?.id).toBe(record.id);
    expect(found?.content).toBeNull();
  });

  it('Dado curativo cifrado com a chave anterior, Quando roda a recifra, Então passa para a chave atual e volta igual', async () => {
    const oldKey = 'chave-antiga-curativo-00000000000000000001';
    const newKey = 'chave-nova-curativo-000000000000000000002';
    const previous = new DataCipher({ current: oldKey });
    // A suíte grava os outros registros com a chave dos testes: a recifra precisa conhecê-la também.
    const rotated = new DataCipher({
      current: newKey,
      previous: [oldKey, 'chave-de-dados-somente-para-testes-0001'],
    });
    const { patientId, appointmentId } = await seedAppointment();
    const record = recordFor(appointmentId, patientId);
    await new DrizzleDressingRecordRepository(appDb, CLINIC, previous).save(
      record,
    );

    await reencryptClinicalData(appDb, rotated);

    const [row] = await db
      .select()
      .from(schema.dressingRecords)
      .where(eq(schema.dressingRecords.id, record.id));
    const onlyNew = new DataCipher({ current: newKey });
    expect(
      JSON.parse(onlyNew.decryptNullable(row?.content ?? null) ?? ''),
    ).toEqual(content);
  });
});
