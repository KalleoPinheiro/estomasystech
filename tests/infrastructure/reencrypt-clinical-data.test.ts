import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { reencryptClinicalData } from '@/infrastructure/persistence/drizzle/reencrypt-clinical-data';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { encryptSecret } from '@/lib/auth/crypto';
import { DataCipher } from '@/lib/data-cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const OLD_KEY = 'chave-antiga-de-dados-000000000000000001';
const NEW_KEY = 'chave-nova-de-dados-0000000000000000002';
const AUTH = 'auth-secret-anterior-ao-195';

describe('Feature: recifra do dado clínico (#195, npm run data:reencrypt)', () => {
  let db: PgliteDatabase<typeof schema>;
  const cipher = new DataCipher({
    current: NEW_KEY,
    previous: [OLD_KEY],
    legacyAuthSecret: AUTH,
  });

  beforeAll(async () => {
    db = drizzle(await createPgliteFromTemplate(), { schema });
    const previous = new DataCipher({ current: OLD_KEY });
    await db.insert(schema.patients).values([
      // texto em claro (anterior à cifra cobrir o campo)
      {
        id: 'p-claro',
        clinicId: 'legacy-clinic',
        fullName: 'A',
        email: 'a@x.com',
        phone: '1',
        notes: 'Nota em claro',
        createdAt: new Date(),
      },
      // chave anterior (rotação)
      {
        id: 'p-antiga',
        clinicId: 'legacy-clinic',
        fullName: 'B',
        email: 'b@x.com',
        phone: '1',
        notes: previous.encrypt('Nota chave antiga'),
        createdAt: new Date(),
      },
      // já na chave atual: não muda
      {
        id: 'p-atual',
        clinicId: 'legacy-clinic',
        fullName: 'C',
        email: 'c@x.com',
        phone: '1',
        notes: cipher.encrypt('Nota atual'),
        createdAt: new Date(),
      },
      {
        id: 'p-nulo',
        clinicId: 'legacy-clinic',
        fullName: 'D',
        email: 'd@x.com',
        phone: '1',
        notes: null,
        createdAt: new Date(),
      },
    ]);
    await db.insert(schema.evolutionNotes).values({
      id: 'evo-legado',
      clinicId: 'legacy-clinic',
      patientId: 'p-claro',
      // formato legado (AUTH_SECRET) e vazio
      subjective: encryptSecret('S legado', AUTH),
      objective: '',
      assessment: 'A em claro',
      plan: previous.encrypt('P antigo'),
      createdAt: new Date(),
    });
    // Pedido do titular (#293) gravado em claro: entra na recifragem.
    await db.insert(schema.dataSubjectRequests).values({
      id: 'dsr-claro',
      clinicId: 'legacy-clinic',
      patientId: 'p-claro',
      kind: 'correction',
      details: 'Telefone em claro',
      status: 'rejected',
      resolution: previous.encrypt('Justificativa antiga'),
      createdAt: new Date(),
      resolvedAt: new Date(),
    });
  });

  it('reencrypts to current key: claro, legado e chave anterior viram v1 da chave atual', async () => {
    const before = await db
      .select({ notes: schema.patients.notes })
      .from(schema.patients)
      .where(eq(schema.patients.id, 'p-atual'));

    const counts = await reencryptClinicalData(db as unknown as AppDb, cipher);

    expect(counts.patients).toBe(2);
    expect(counts.evolution_notes).toBe(1);
    expect(counts.data_subject_requests).toBe(1);
    const [dsr] = await db.select().from(schema.dataSubjectRequests);
    expect(cipher.decrypt(dsr.details as string)).toBe('Telefone em claro');
    expect(cipher.decrypt(dsr.resolution as string)).toBe(
      'Justificativa antiga',
    );
    const patients = await db.select().from(schema.patients);
    const notes = Object.fromEntries(patients.map((p) => [p.id, p.notes]));
    for (const id of ['p-claro', 'p-antiga', 'p-atual']) {
      expect(cipher.isCurrent(notes[id] as string), id).toBe(true);
    }
    expect(cipher.decrypt(notes['p-claro'] as string)).toBe('Nota em claro');
    expect(cipher.decrypt(notes['p-antiga'] as string)).toBe(
      'Nota chave antiga',
    );
    expect(notes['p-atual']).toBe(before[0].notes);
    expect(notes['p-nulo']).toBeNull();

    const [evo] = await db.select().from(schema.evolutionNotes);
    expect(cipher.decrypt(evo.subjective)).toBe('S legado');
    expect(evo.objective).toBe('');
    expect(cipher.decrypt(evo.assessment)).toBe('A em claro');
    expect(cipher.decrypt(evo.plan)).toBe('P antigo');
    for (const value of [evo.subjective, evo.assessment, evo.plan]) {
      expect(cipher.isCurrent(value)).toBe(true);
    }
  });

  it('idempotent: a segunda execução não altera nenhuma linha', async () => {
    const snapshot = await db.select().from(schema.patients);

    const counts = await reencryptClinicalData(db as unknown as AppDb, cipher);

    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    expect(await db.select().from(schema.patients)).toEqual(snapshot);
  });
});
