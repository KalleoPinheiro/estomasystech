import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type DressingContent,
  DressingRecord,
} from '@/domain/clinical/dressing-record';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleDressingRecordRepository } from '@/infrastructure/persistence/drizzle/drizzle-dressing-record-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * Insumos usados no curativo (#963, T2): gravam com o registro, voltam na ordem,
 * ficam no escopo da empresa e desfazem junto se o registro não grava.
 */

const CLINIC = 'legacy-clinic';
const OLD = new Date('2000-01-01T12:00:00Z');

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

async function seedSupply(clinicId = CLINIC) {
  const id = nextId('sup');
  await db.insert(schema.supplies).values({
    id,
    clinicId,
    name: `Insumo ${id}`,
    unit: 'un',
    minQty: 0,
    priceCents: 100,
    createdAt: OLD,
  });
  return id;
}

beforeAll(async () => {
  db = drizzle(await createPgliteFromTemplate(), { schema });
  appDb = db as unknown as AppDb;
});

describe('Feature: persistência dos insumos do curativo (#963, T2)', () => {
  it('Dado curativo com itens, Quando lê pela consulta e pelo paciente, Então os itens voltam na ordem informada', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    const [soro, alginato, fita] = [
      await seedSupply(),
      await seedSupply(),
      await seedSupply(),
    ];
    const items = [
      { role: 'solucao' as const, supplyId: soro, quantity: 1 },
      { role: 'cobertura_primaria' as const, supplyId: alginato, quantity: 2 },
      { role: 'fixacao' as const, supplyId: fita, quantity: 1 },
    ];
    const record = DressingRecord.create({
      patientId,
      appointmentId,
      content,
      items,
    });
    const bare = recordFor(appointmentId, patientId);

    await repo.save(record);
    await repo.save(bare);

    const byAppointment = await repo.findByAppointmentId(appointmentId);
    const saved = byAppointment.find((r) => r.id === record.id);
    expect(saved?.items).toEqual(items);
    expect(byAppointment.find((r) => r.id === bare.id)?.items).toEqual([]);
    const byPatient = await repo.findByPatientId(patientId);
    expect(byPatient.find((r) => r.id === record.id)?.items).toEqual(items);
    const rows = await db
      .select()
      .from(schema.dressingRecordItems)
      .where(eq(schema.dressingRecordItems.dressingRecordId, record.id));
    expect(rows.map((row) => row.clinicId)).toEqual([CLINIC, CLINIC, CLINIC]);
  });

  it('Dado itens de outra empresa no banco, Quando outra empresa lê, Então não vê o registro nem os itens', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const other = new DrizzleDressingRecordRepository(
      appDb,
      'outra-clinica',
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    const supplyId = await seedSupply();
    await repo.save(
      DressingRecord.create({
        patientId,
        appointmentId,
        content,
        items: [{ role: 'protecao', supplyId, quantity: 1 }],
      }),
    );

    expect(await other.findByAppointmentId(appointmentId)).toEqual([]);
  });

  it('Dado item com insumo inexistente, Quando salva, Então nada grava, nem o registro', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    const record = DressingRecord.create({
      patientId,
      appointmentId,
      content,
      items: [{ role: 'solucao', supplyId: 'nao-existe', quantity: 1 }],
    });

    await expect(repo.save(record)).rejects.toThrow();

    expect(await repo.findByAppointmentId(appointmentId)).toEqual([]);
  });
});

describe('Feature: item do curativo preso à empresa (#963, T2; CodeRabbit no PR 1018)', () => {
  it('Dado insumo de outra empresa, Quando salva o item, Então a chave composta recusa e nada grava', async () => {
    const repo = new DrizzleDressingRecordRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { patientId, appointmentId } = await seedAppointment();
    await db
      .insert(schema.clinics)
      .values({
        id: 'clinica-alheia',
        name: 'Alheia',
        createdBy: 'system',
        createdAt: OLD,
      })
      .onConflictDoNothing();
    const foreign = await seedSupply('clinica-alheia');
    const record = DressingRecord.create({
      patientId,
      appointmentId,
      content,
      items: [{ role: 'solucao', supplyId: foreign, quantity: 1 }],
    });

    await expect(repo.save(record)).rejects.toThrow();

    expect(await repo.findByAppointmentId(appointmentId)).toEqual([]);
  });
});
