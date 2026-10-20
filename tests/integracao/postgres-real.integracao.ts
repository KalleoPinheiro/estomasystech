import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const CLINIC_ID = 'clinic-concorrencia';
const PATIENT_ID = 'patient-concorrencia';

describe('Feature: Postgres real na suíte de integração (#404)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_conc_${process.pid}_${Date.now()}`;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    // Várias conexões: o ponto aqui é a concorrência de verdade, que o PGlite (1 conexão) não dá.
    pool = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 4,
    });
    db = drizzle(pool, { schema });
    await db.insert(schema.clinics).values({
      id: CLINIC_ID,
      name: 'Clínica Concorrência',
      createdAt: new Date('2026-10-20T10:00:00Z'),
      createdBy: 'teste',
    });
    await db.insert(schema.patients).values({
      id: PATIENT_ID,
      clinicId: CLINIC_ID,
      fullName: 'Paciente Concorrência',
      phone: '11999990000',
      createdAt: new Date('2026-10-20T10:00:00Z'),
    });
  });

  afterAll(async () => {
    await pool.end();
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    );
  });

  it('Dado a suíte de integração, Quando consulto o servidor, Então é PostgreSQL com pg_trgm e btree_gist', async () => {
    const version = await db.execute(sql`SELECT version() AS version`);
    const extensions = await db.execute(
      sql`SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'btree_gist') ORDER BY extname`,
    );

    expect(String(version.rows[0]?.version)).toMatch(/^PostgreSQL \d+/);
    expect(extensions.rows.map((row) => row.extname)).toEqual([
      'btree_gist',
      'pg_trgm',
    ]);
  });

  it('Dado duas consultas no mesmo horário, Quando gravadas ao mesmo tempo em conexões distintas, Então o banco aceita só uma (anti-double-booking)', async () => {
    const appointment = (id: string) => ({
      id,
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      startsAt: new Date('2027-03-01T13:00:00Z'),
      endsAt: new Date('2027-03-01T14:00:00Z'),
      procedure: 'Troca de curativo',
      priceCents: 15_000,
      status: 'scheduled',
      createdAt: new Date('2026-10-20T10:00:00Z'),
    });

    const results = await Promise.allSettled([
      db.insert(schema.appointments).values(appointment('apt-concorrente-1')),
      db.insert(schema.appointments).values(appointment('apt-concorrente-2')),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason.cause.code).toBe('23P01');
    const stored = await db.select().from(schema.appointments);
    expect(stored).toHaveLength(1);
  });
});
