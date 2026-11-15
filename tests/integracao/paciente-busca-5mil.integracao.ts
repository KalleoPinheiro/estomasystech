import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DrizzleGuardianRepository } from '@/infrastructure/persistence/drizzle/drizzle-guardian-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { BlindIndex } from '@/lib/blind-index';
import { TEST_CIPHER } from '../support/cipher';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const CLINIC_ID = 'clinic-busca-5mil';
const TOTAL = 5_000;
const RUNS = 20;
/** Teto folgado de p95 (ms): o número medido fica no log e no ADR-074; o teto só pega regressão grosseira. */
const P95_BUDGET_MS = 1_500;
const BLIND = new BlindIndex({
  current: 'pepper-de-teste-da-integracao-000000001',
});

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabi'];
const LAST = ['Silva', 'Souza', 'Lima', 'Costa', 'Alves', 'Rocha', 'Dias'];

/** CPF válido a partir de uma base de 9 dígitos (dígitos verificadores calculados). */
function cpfFrom(base: number): string {
  const digits = String(base).padStart(9, '0').split('').map(Number);
  const check = (len: number) => {
    const sum = digits
      .slice(0, len)
      .reduce((acc, d, i) => acc + d * (len + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  digits.push(check(9));
  digits.push(check(10));
  return digits.join('');
}

const p95 = (samples: number[]) =>
  [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];

async function measure(run: () => Promise<unknown>): Promise<number> {
  await run(); // aquece
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  return p95(samples);
}

describe('Feature: busca de pacientes com 5 mil cadastros cifrados (#740, ADR-074/096, Postgres real)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_busca5k_${process.pid}_${Date.now()}`;
  let pool: Pool;
  let patients: DrizzlePatientRepository;
  let guardians: DrizzleGuardianRepository;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    pool = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 2,
    });
    const db = drizzle(pool, { schema });
    await db.insert(schema.clinics).values({
      id: CLINIC_ID,
      name: 'Clínica 5 mil',
      createdAt: new Date('2026-10-20T10:00:00Z'),
      createdBy: 'teste',
    });
    const rows = Array.from({ length: TOTAL }, (_, i) => {
      const phone = `+55119${String(10_000_000 + i)}`;
      const cpf = cpfFrom(100_000_000 + i);
      return {
        id: `p-${String(i).padStart(5, '0')}`,
        clinicId: CLINIC_ID,
        fullName: TEST_CIPHER.encrypt(
          `${FIRST[i % FIRST.length]} ${LAST[(i >> 3) % LAST.length]} ${i}`,
        ),
        phone: TEST_CIPHER.encrypt(phone),
        cpf: TEST_CIPHER.encrypt(cpf),
        cpfHash: BLIND.hash(CLINIC_ID, 'cpf', cpf),
        phoneHash: BLIND.hash(CLINIC_ID, 'phone', phone),
        createdAt: new Date('2026-10-20T10:00:00Z'),
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(schema.patients).values(rows.slice(i, i + 500));
    }
    const guardianRows = Array.from({ length: 1_000 }, (_, i) => {
      const phone = `+55119${String(20_000_000 + i)}`;
      return {
        id: `g-${String(i).padStart(4, '0')}`,
        clinicId: CLINIC_ID,
        fullName: TEST_CIPHER.encrypt(
          `Responsável ${LAST[i % LAST.length]} ${i}`,
        ),
        relationship: 'mae',
        phone: TEST_CIPHER.encrypt(phone),
        phoneHash: BLIND.hash(CLINIC_ID, 'phone', phone),
        createdAt: new Date('2026-10-20T10:00:00Z'),
      };
    });
    await db.insert(schema.guardians).values(guardianRows);
    patients = new DrizzlePatientRepository(
      db as never,
      CLINIC_ID,
      TEST_CIPHER,
      BLIND,
    );
    guardians = new DrizzleGuardianRepository(
      db as never,
      CLINIC_ID,
      TEST_CIPHER,
      BLIND,
    );
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    );
  });

  it('Dado 5 mil pacientes, Quando buscar por nome, CPF, telefone e listar a página do seletor, Então o p95 de cada caminho cabe no teto', async () => {
    const cases: [string, () => Promise<unknown[]>][] = [
      ['nome (trecho)', () => patients.findAll('silva 12')],
      ['CPF exato', () => patients.findAll(cpfFrom(100_002_500))],
      ['telefone exato', () => patients.findAll('(11) 91000-2500')],
      ['seletor (primeira página)', () => patients.findAll(undefined)],
      [
        'seletor (próxima página)',
        async () => {
          const first = await patients.findAll(undefined, { limit: 50 });
          return patients.findAll(undefined, {
            limit: 50,
            cursor: Buffer.from(
              JSON.stringify({ id: first[first.length - 1].id }),
            ).toString('base64url'),
          });
        },
      ],
    ];
    const report: Record<string, string> = {};
    for (const [label, run] of cases) {
      const value = await measure(run);
      report[label] = `${value.toFixed(0)} ms`;
      expect(value, `p95 de ${label}`).toBeLessThan(P95_BUDGET_MS);
    }
    console.log(`[#740] p95 com ${TOTAL} pacientes:`, JSON.stringify(report));
    expect((await patients.findAll(cpfFrom(100_002_500))).length).toBe(1);
    expect((await patients.findAll('(11) 91000-2500')).length).toBe(1);
  }, 180_000);

  it('Dado 1 mil responsáveis, Quando buscar por nome e telefone, Então o p95 cabe no teto', async () => {
    const byName = await measure(() => guardians.findAll('responsavel silva'));
    const byPhone = await measure(() => guardians.findAll('(11) 92000-0500'));
    console.log(
      `[#740] p95 com 1000 responsáveis: nome ${byName.toFixed(0)} ms, telefone ${byPhone.toFixed(0)} ms`,
    );
    expect(byName).toBeLessThan(P95_BUDGET_MS);
    expect(byPhone).toBeLessThan(P95_BUDGET_MS);
    expect((await guardians.findAll('(11) 92000-0500')).length).toBe(1);
  }, 60_000);
});
