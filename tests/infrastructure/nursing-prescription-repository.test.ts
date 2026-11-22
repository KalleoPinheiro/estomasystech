import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NursingPrescription,
  type PrescriptionContent,
} from '@/domain/clinical/nursing-prescription';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleNursingPrescriptionRepository } from '@/infrastructure/persistence/drizzle/drizzle-nursing-prescription-repository';
import { DrizzleRetentionRepository } from '@/infrastructure/persistence/drizzle/drizzle-retention-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { InMemoryNursingPrescriptionRepository } from '@/infrastructure/persistence/in-memory/in-memory-care-plan-repositories';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

/**
 * Receituário emitido (#956, ADR-116): o conteúdo vai cifrado num JSON só, volta
 * igual, fica no escopo da empresa e sai na anonimização por retenção.
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

const content: PrescriptionContent = {
  issuer: {
    name: 'Clínica Pele',
    document: null,
    registry: null,
    address: null,
  },
  city: null,
  patientName: 'Maria Sigilosa',
  items: [{ label: 'Cuidados com lesões', frequency: 'diária' }],
  freeText: 'Manter a pele seca.',
  signer: { name: 'Enf. Ana', registry: 'COREN-SP 1' },
};

async function seedPlan() {
  const patientId = nextId('pat');
  await db.insert(schema.patients).values({
    id: patientId,
    clinicId: CLINIC,
    fullName: 'Maria Sigilosa',
    email: `${patientId}@x.com`,
    phone: '11999990000',
    birthDate: new Date('1950-07-15T00:00:00Z'),
    createdAt: OLD,
  });
  const planId = nextId('plan');
  await db.insert(schema.carePlans).values({
    id: planId,
    clinicId: CLINIC,
    patientId,
    status: 'active',
    createdAt: OLD,
  });
  return { patientId, planId };
}

const prescriptionFor = (planId: string, patientId: string) =>
  NursingPrescription.create({
    carePlanId: planId,
    patientId,
    issuedBy: 'ana@clinica.com',
    content,
  });

beforeAll(async () => {
  const client = await createPgliteFromTemplate();
  db = drizzle(client, { schema });
  appDb = db as unknown as AppDb;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Feature: persistência do receituário emitido (#956, ADR-116)', () => {
  it('Dado receituário salvo, Quando lê, Então volta igual e a coluna guarda só cifra', async () => {
    const repo = new DrizzleNursingPrescriptionRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { planId, patientId } = await seedPlan();
    const prescription = prescriptionFor(planId, patientId);

    await repo.save(prescription);

    const found = await repo.findById(prescription.id);
    expect(found?.content).toEqual(content);
    expect(found?.carePlanId).toBe(planId);
    expect(found?.patientId).toBe(patientId);
    expect(found?.issuedBy).toBe('ana@clinica.com');
    expect(found?.issuedAt).toEqual(prescription.issuedAt);
    const [row] = await db
      .select()
      .from(schema.nursingPrescriptions)
      .where(eq(schema.nursingPrescriptions.id, prescription.id));
    expect(row?.clinicId).toBe(CLINIC);
    expect(row?.content).not.toContain('Maria');
    expect(row?.content).not.toContain('pele seca');
    expect(await repo.findById('inexistente')).toBeNull();
  });

  it('Dados dois receituários do plano, Quando lista, Então o mais novo vem primeiro e outra empresa não vê', async () => {
    const repo = new DrizzleNursingPrescriptionRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { planId, patientId } = await seedPlan();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    const older = prescriptionFor(planId, patientId);
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    const newer = prescriptionFor(planId, patientId);
    vi.useRealTimers();
    await repo.save(older);
    await repo.save(newer);

    const listed = await repo.findByCarePlanId(planId);
    const other = new DrizzleNursingPrescriptionRepository(
      appDb,
      'outra-clinica',
      TEST_CIPHER,
    );

    expect(listed.map((item) => item.id)).toEqual([newer.id, older.id]);
    const byPatient = await repo.findByPatientId(patientId);
    expect(byPatient.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(await repo.findByPatientId('outro-paciente')).toEqual([]);
    expect(await other.findByPatientId(patientId)).toEqual([]);
    expect(await other.findByCarePlanId(planId)).toEqual([]);
    expect(await other.findById(newer.id)).toBeNull();
  });

  it('Dado escopo de sistema, Quando salva, Então recusa', async () => {
    const repo = new DrizzleNursingPrescriptionRepository(
      appDb,
      null,
      TEST_CIPHER,
    );

    await expect(repo.save(prescriptionFor('p', 'x'))).rejects.toThrow(
      'Papel de sistema não pode salvar receituário (somente leitura cross-empresa)',
    );
  });

  it('Dado paciente anonimizado pela retenção, Quando lê o receituário, Então o número fica e o conteúdo sai', async () => {
    const repo = new DrizzleNursingPrescriptionRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );
    const { planId, patientId } = await seedPlan();
    const prescription = prescriptionFor(planId, patientId);
    await repo.save(prescription);
    const retention = new DrizzleRetentionRepository(
      appDb,
      CLINIC,
      TEST_CIPHER,
    );

    await retention.anonymizePatient(patientId, NOW, CUTOFF_20);

    const found = await repo.findById(prescription.id);
    expect(found?.content).toBeNull();
    expect(found?.documentNumber).toBe(prescription.documentNumber);
  });

  it('Dado o repositório em memória, Quando salva e lista, Então espelha o do banco', async () => {
    const repo = new InMemoryNursingPrescriptionRepository();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    const older = prescriptionFor('plano-1', 'pac-1');
    const tieA = prescriptionFor('plano-1', 'pac-1');
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    const newer = prescriptionFor('plano-1', 'pac-1');
    const elsewhere = prescriptionFor('plano-2', 'pac-1');
    for (const item of [older, tieA, newer, elsewhere]) await repo.save(item);

    const listed = await repo.findByCarePlanId('plano-1');

    const tie = [older.id, tieA.id].sort().reverse();
    expect(listed.map((item) => item.id)).toEqual([newer.id, ...tie]);
    expect(await repo.findById(newer.id)).toBe(newer);
    const otherPatient = prescriptionFor('plano-3', 'pac-2');
    await repo.save(otherPatient);
    const latest = [newer.id, elsewhere.id].sort().reverse();
    expect(
      (await repo.findByPatientId('pac-1')).map((item) => item.id),
    ).toEqual([...latest, ...tie]);
    expect(
      (await repo.findByPatientId('pac-2')).map((item) => item.id),
    ).toEqual([otherPatient.id]);
    expect(await repo.findById('nada')).toBeNull();
  });
});
