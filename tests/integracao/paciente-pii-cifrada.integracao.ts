import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
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

const CLINIC_ID = 'clinic-pii-cifrada';

describe('Feature: PII do paciente cifrada em repouso (ADR-096, Postgres real)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_pii_${process.pid}_${Date.now()}`;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    pool = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 2,
    });
    db = drizzle(pool, { schema });
    await db.insert(schema.clinics).values({
      id: CLINIC_ID,
      name: 'Clínica PII',
      createdAt: new Date('2026-10-20T10:00:00Z'),
      createdBy: 'teste',
    });
  });

  afterAll(async () => {
    await pool.end();
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    );
  });

  it('Dado um paciente cadastrado, Quando leio a tabela direto no Postgres, Então nome, e-mail, telefone e nascimento saem cifrados e a busca por CPF funciona', async () => {
    const repo = new DrizzlePatientRepository(
      db as never,
      CLINIC_ID,
      TEST_CIPHER,
      new BlindIndex({ current: 'pepper-de-teste-da-integracao-000000001' }),
    );
    const patient = Patient.create({
      fullName: 'Helena Prontuário',
      email: 'helena@clinica.example',
      phone: '11977776666',
      cpf: '52998224725',
      birthDate: new Date('1985-07-20T00:00:00Z'),
    });
    await repo.save(patient);

    const raw = await db.execute(
      sql`SELECT full_name, email, phone, cpf, birth_date, birth_date_enc FROM patients WHERE id = ${patient.id}`,
    );
    const row = raw.rows[0] as Record<string, string | null>;
    for (const column of [
      'full_name',
      'email',
      'phone',
      'cpf',
      'birth_date_enc',
    ]) {
      expect(row[column]).toMatch(/^v1\./);
    }
    expect(row.birth_date).toBeNull();
    expect(JSON.stringify(row)).not.toMatch(
      /Helena|clinica\.example|977776666|52998224725|1985/,
    );
    expect((await repo.findAll('529.982.247-25')).map((p) => p.id)).toEqual([
      patient.id,
    ]);
    expect((await repo.findAll('helena')).map((p) => p.id)).toEqual([
      patient.id,
    ]);
  });
});
