import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * RLS etapa 4 (#873): a migração 0077 dá `clinic_id` a `procedure_supplies`, que já tem linhas em produção.
 * O teste parte do esquema da etapa 3 (migrações até a 0076), grava kits "como a versão anterior" (sem
 * `clinic_id`) e aplica as migrações novas por cima: o preenchimento sai do procedimento, sem linha nula.
 */
const LAST_BEFORE = '0076_rls-politicas-baixo-risco';
const migrationsDir = path.join(process.cwd(), 'drizzle');

function folderUpTo(tag: string): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'rls4-'));
  cpSync(migrationsDir, folder, { recursive: true });
  const journalPath = path.join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string }[];
  };
  const last = journal.entries.findIndex((entry) => entry.tag === tag);
  journal.entries = journal.entries.slice(0, last + 1);
  mkdirSync(path.dirname(journalPath), { recursive: true });
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe('Feature: preenchimento de clinic_id em procedure_supplies (#873)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls4b_${process.pid}_${Date.now()}`;
  let pool: Pool;
  const folders: string[] = [];

  beforeAll(async () => {
    await adminQuery(baseUrl, `CREATE DATABASE ${quoteIdent(databaseName)}`);
    pool = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
  });

  afterAll(async () => {
    await pool?.end();
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    ).catch(() => undefined);
    for (const folder of folders)
      rmSync(folder, { recursive: true, force: true });
  });

  it('Dado kits gravados antes da migração, Quando aplico 0077 a 0079, Então cada linha herda a empresa do procedimento e a coluna fica NOT NULL', async () => {
    const before = folderUpTo(LAST_BEFORE);
    folders.push(before);
    await migrate(drizzle(pool), { migrationsFolder: before });
    for (const id of ['clinica-a', 'clinica-b']) {
      await pool.query(
        `INSERT INTO clinics (id, name, created_at, created_by) VALUES ($1, $1, now(), 'teste')`,
        [id],
      );
      await pool.query(
        `INSERT INTO procedures (id, clinic_id, name, price_cents, duration_minutes, created_at)
         VALUES ($1, $2, $1, 100, 30, now())`,
        [`proc-${id}`, id],
      );
      await pool.query(
        `INSERT INTO procedure_supplies (procedure_id, supply_id, quantity) VALUES ($1, 'insumo-1', 1), ($1, 'insumo-2', 2)`,
        [`proc-${id}`],
      );
    }

    await migrate(drizzle(pool), { migrationsFolder: migrationsDir });

    const rows = await pool.query<{ procedure_id: string; clinic_id: string }>(
      `SELECT procedure_id, clinic_id FROM procedure_supplies ORDER BY procedure_id, supply_id`,
    );
    expect(rows.rows).toEqual([
      { procedure_id: 'proc-clinica-a', clinic_id: 'clinica-a' },
      { procedure_id: 'proc-clinica-a', clinic_id: 'clinica-a' },
      { procedure_id: 'proc-clinica-b', clinic_id: 'clinica-b' },
      { procedure_id: 'proc-clinica-b', clinic_id: 'clinica-b' },
    ]);
    const column = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'procedure_supplies' AND column_name = 'clinic_id'`,
    );
    expect(column.rows).toEqual([{ is_nullable: 'NO' }]);
  });

  it('Dado a migração aplicada, Quando a base antiga grava kit sem clinic_id, Então o gatilho completa e o banco aceita', async () => {
    await pool.query(
      `INSERT INTO procedure_supplies (procedure_id, supply_id, quantity) VALUES ('proc-clinica-a', 'insumo-3', 1)`,
    );

    const stored = await pool.query<{ clinic_id: string }>(
      `SELECT clinic_id FROM procedure_supplies WHERE supply_id = 'insumo-3'`,
    );
    expect(stored.rows).toEqual([{ clinic_id: 'clinica-a' }]);
  });
});
