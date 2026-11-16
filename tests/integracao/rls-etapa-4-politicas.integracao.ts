import { readFileSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { scopeDbToClinic } from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleProcedureKitRepository,
  DrizzleProcedureRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { DrizzleProfessionalRepository } from '@/infrastructure/persistence/drizzle/drizzle-professional-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * RLS etapa 4 (#873, ADR-110): as migrações 0077 a 0079 ligam a política `clinic_isolation` em todas as
 * tabelas com `clinic_id` NOT NULL (clínicas, agenda, prontuário, estoque, comunicação e financeiro) e dão
 * `clinic_id` a `procedure_supplies`. A prova usa o Postgres real (o PGlite roda como superusuário e ignora a
 * política), com o papel da aplicação (não dono, sem BYPASSRLS), o de sistema (BYPASSRLS) e o dono.
 *
 * A prova de isolamento é genérica: o teste lê o catálogo, monta uma linha por clínica em cada tabela
 * (`session_replication_role = replica` dispensa as chaves estrangeiras; os CHECKs são retirados só do banco
 * clonado) e exige o mesmo comportamento de todas. Uma tabela nova com `clinic_id` sem política reprova o teste.
 */
const CLINIC_A = 'clinic-rls4-a';
const CLINIC_B = 'clinic-rls4-b';
const APP_GROUP = 'estomasystech_app';
/** Tabelas com `clinic_id` que NÃO ganham política nesta etapa (identidade e auditoria; ver ADR-110). */
const OUT_OF_SCOPE = ['audit_events', 'google_accounts', 'user_accounts'];
const SQL_FILES = [
  '0077_rls-procedure-supplies-clinic',
  '0078_rls-politicas-clinicas',
  '0079_rls-politicas-financeiro',
];
const sqlOf = (file: string) =>
  readFileSync(path.join(process.cwd(), 'drizzle', `${file}.sql`), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);

describe('Feature: políticas de RLS nas tabelas clínicas e financeiras (#873)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls4_${process.pid}_${Date.now()}`;
  const appRole = `app_rls4_${process.pid}`;
  const systemRole = `sys_rls4_${process.pid}`;
  const password = 'senha-descartavel-rls4';
  let admin: Pool;
  let app: Pool;
  let system: Pool;
  let appDb: AppDb;
  let covered: string[] = [];

  const asRole = (role: string) => {
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = role;
    url.password = password;
    // max 1: a mesma conexão serve todas as transações, o pior caso para vazar o setting.
    return new Pool({ connectionString: url.toString(), max: 1 });
  };

  async function inClinic<T>(
    clinicId: string | null,
    fn: (client: PoolClient) => Promise<T>,
    pool: Pool = app,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (clinicId !== null) {
        await client.query(`SELECT set_config('app.clinic_id', $1, true)`, [
          clinicId,
        ]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const clinicsOf = (table: string) => (client: PoolClient) =>
    client
      .query<{ clinic_id: string }>(
        `SELECT clinic_id FROM ${quoteIdent(table)} ORDER BY clinic_id`,
      )
      .then((result) => result.rows.map((row) => row.clinic_id));

  /** Tabelas do `public` com a coluna `clinic_id`. */
  const tablesWithClinicId = async () =>
    (
      await admin.query<{ table_name: string }>(
        `SELECT t.table_name FROM information_schema.tables t
           JOIN information_schema.columns c
             ON c.table_schema = t.table_schema AND c.table_name = t.table_name
          WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name = 'clinic_id'
          ORDER BY t.table_name`,
      )
    ).rows.map((row) => row.table_name);

  /** Valores de uma linha da tabela para a clínica, sem depender das regras de cada tabela. */
  async function rowFor(table: string, clinicId: string) {
    const columns = await admin.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
    }>(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND is_nullable = 'NO' AND column_default IS NULL AND is_generated = 'NEVER'
        ORDER BY ordinal_position`,
      [table],
    );
    const names: string[] = [];
    const values: unknown[] = [];
    for (const column of columns.rows) {
      names.push(quoteIdent(column.column_name));
      if (column.column_name === 'clinic_id') values.push(clinicId);
      else if (column.data_type === 'text')
        values.push(`${table}.${column.column_name}.${clinicId}`);
      else if (column.data_type === 'integer') values.push(1);
      else if (column.data_type === 'date') values.push('2026-12-25');
      else if (column.data_type.startsWith('timestamp'))
        values.push('2026-11-16T10:00:00Z');
      else throw new Error(`tipo sem valor de teste: ${column.data_type}`);
    }
    const marks = values.map((_, index) => `$${index + 1}`).join(', ');
    return {
      sql: `INSERT INTO ${quoteIdent(table)} (${names.join(', ')}) VALUES (${marks})`,
      values,
    };
  }

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    // Banco descartável: sem chaves estrangeiras nem CHECKs, as linhas genéricas bastam para provar a política.
    await admin.query(`SET session_replication_role = replica`);
    const checks = await admin.query<{ relname: string; conname: string }>(
      `SELECT c.relname, k.conname FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
        WHERE k.contype = 'c' AND c.relnamespace = 'public'::regnamespace`,
    );
    for (const check of checks.rows) {
      await admin.query(
        `ALTER TABLE ${quoteIdent(check.relname)} DROP CONSTRAINT ${quoteIdent(check.conname)}`,
      );
    }
    for (const id of [CLINIC_A, CLINIC_B]) {
      await admin.query(
        `INSERT INTO clinics (id, name, created_at, created_by) VALUES ($1, $1, now(), 'teste')`,
        [id],
      );
    }
    covered = (await tablesWithClinicId()).filter(
      (table) => !OUT_OF_SCOPE.includes(table),
    );
    for (const table of covered) {
      for (const clinicId of [CLINIC_A, CLINIC_B]) {
        const row = await rowFor(table, clinicId);
        await admin.query(row.sql, row.values);
      }
    }
    await admin.query(
      `CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD '${password}' IN ROLE ${APP_GROUP}`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(systemRole)} LOGIN PASSWORD '${password}' BYPASSRLS IN ROLE ${APP_GROUP}`,
    );
    app = asRole(appRole);
    system = asRole(systemRole);
    appDb = drizzle(app, { schema }) as unknown as AppDb;
  });

  afterAll(async () => {
    // O papel de grupo é do cluster (compartilhado): só os logins deste arquivo saem.
    for (const step of [
      () => app?.end(),
      () => system?.end(),
      () => admin?.end(),
      () =>
        adminQuery(
          baseUrl,
          `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
        ),
      () => adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(appRole)}`),
      () =>
        adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(systemRole)}`),
    ]) {
      await Promise.resolve(step()).catch(() => undefined);
    }
  });

  it('Dado o esquema migrado, Quando leio o catálogo, Então toda tabela com clinic_id (menos as de identidade e auditoria) tem RLS e a política clinic_isolation', async () => {
    // Não afirma o que fica de fora nem FORCE: o portão de compatibilidade roda este arquivo da base sobre o
    // esquema das etapas seguintes (identidade e auditoria, FORCE), que mudam exatamente isso.
    const rows = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      policies: string[] | null;
    }>(
      `SELECT c.relname, c.relrowsecurity,
              (SELECT array_agg(p.policyname::text ORDER BY p.policyname) FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
         FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname = ANY($1)
        ORDER BY c.relname`,
      [covered],
    );

    expect(rows.rows.map((row) => row.relname)).toEqual([...covered].sort());
    for (const row of rows.rows) {
      expect({ ...row }).toMatchObject({
        relrowsecurity: true,
        policies: expect.arrayContaining(['clinic_isolation']),
      });
    }
    expect(covered.length).toBeGreaterThanOrEqual(38);
  });

  it('Dado o catálogo, Quando procuro tabela com RLS sem índice líder em clinic_id, Então não há (a política filtra toda consulta)', async () => {
    const unindexed = await admin.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relrowsecurity
          AND NOT EXISTS (
            SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
             WHERE i.indrelid = c.oid AND a.attname = 'clinic_id' AND i.indpred IS NULL AND i.indexprs IS NULL)
        ORDER BY c.relname`,
    );
    expect(unindexed.rows).toEqual([]);
  });

  it('Dado cada tabela coberta, Quando o papel da aplicação consulta sem WHERE, Então vê só a clínica da transação', async () => {
    for (const table of covered) {
      expect(await inClinic(CLINIC_A, clinicsOf(table))).toEqual([CLINIC_A]);
      expect(await inClinic(CLINIC_B, clinicsOf(table))).toEqual([CLINIC_B]);
    }
  });

  it('Dado cada tabela coberta, Quando a transação não grava app.clinic_id, Então falha fechado (zero linhas)', async () => {
    for (const table of covered) {
      expect(await inClinic(null, clinicsOf(table))).toEqual([]);
    }
  });

  it('Dado o pool de uma conexão, Quando a transação da A termina, Então a consulta seguinte, sem clínica, não vê nada', async () => {
    await inClinic(CLINIC_A, clinicsOf('patients'));
    for (const table of covered) {
      expect(
        (await app.query(`SELECT 1 FROM ${quoteIdent(table)}`)).rowCount,
      ).toBe(0);
    }
  });

  it('Dado cada tabela coberta, Quando a clínica A move linha para a B ou insere em nome da B, Então WITH CHECK recusa', async () => {
    for (const table of covered) {
      await expect(
        inClinic(CLINIC_A, (client) =>
          client.query(`UPDATE ${quoteIdent(table)} SET clinic_id = $1`, [
            CLINIC_B,
          ]),
        ),
      ).rejects.toThrow(/row-level security/);
      const intruder = await rowFor(table, CLINIC_B);
      await expect(
        inClinic(CLINIC_A, (client) =>
          client.query(intruder.sql, intruder.values),
        ),
      ).rejects.toThrow(/row-level security|already exists|duplicate/);
    }
  });

  it('Dado cada tabela coberta, Quando a clínica A atualiza e remove sem filtro, Então só afeta as linhas da A', async () => {
    for (const table of covered) {
      const touched = await app.connect();
      try {
        await touched.query('BEGIN');
        await touched.query(`SELECT set_config('app.clinic_id', $1, true)`, [
          CLINIC_A,
        ]);
        const updated = await touched.query(
          `UPDATE ${quoteIdent(table)} SET clinic_id = clinic_id`,
        );
        const removed = await touched.query(`DELETE FROM ${quoteIdent(table)}`);
        expect({ table, updated: updated.rowCount }).toEqual({
          table,
          updated: 1,
        });
        expect({ table, removed: removed.rowCount }).toEqual({
          table,
          removed: 1,
        });
      } finally {
        // Desfaz para as provas seguintes enxergarem as linhas.
        await touched.query('ROLLBACK');
        touched.release();
      }
    }
  });

  it('Dado cada tabela coberta, Quando o papel de sistema (BYPASSRLS) lê sem clínica, Então vê todas as clínicas', async () => {
    for (const table of covered) {
      expect(await inClinic(null, clinicsOf(table), system)).toEqual([
        CLINIC_A,
        CLINIC_B,
      ]);
    }
  });

  it('Dado cada tabela coberta, Quando o dono (como a produção conecta hoje) lê, Então a política não o filtra', async () => {
    for (const table of covered) {
      const rows = await admin.query<{ clinic_id: string }>(
        `SELECT clinic_id FROM ${quoteIdent(table)} ORDER BY clinic_id`,
      );
      expect(rows.rows.map((row) => row.clinic_id)).toEqual([
        CLINIC_A,
        CLINIC_B,
      ]);
    }
  });

  it('Dado os repositórios reais com o papel da aplicação, Quando listo com o escopo da A, Então só vejo a A', async () => {
    const scoped = await scopeDbToClinic(appDb, CLINIC_A);

    const professionals = await new DrizzleProfessionalRepository(
      scoped,
      CLINIC_A,
    ).findAll();
    const procedures = await new DrizzleProcedureRepository(
      scoped,
      CLINIC_A,
    ).findAll();

    expect(professionals.map((p) => p.id)).toEqual([
      `professionals.id.${CLINIC_A}`,
    ]);
    expect(procedures.map((p) => p.id)).toEqual([`procedures.id.${CLINIC_A}`]);
  });

  describe('procedure_supplies (decisão: coluna clinic_id, não EXISTS)', () => {
    const procedureA = `procedures.id.${CLINIC_A}`;
    const procedureB = `procedures.id.${CLINIC_B}`;

    it('Dado o kit gravado pelo repositório da A, Quando leio como A e como B, Então a A vê e a B não', async () => {
      const kitA = new DrizzleProcedureKitRepository(
        await scopeDbToClinic(appDb, CLINIC_A),
      );
      await kitA.setKit(procedureA, [
        { supplyId: 'insumo-1', quantity: 2 },
        { supplyId: 'insumo-2', quantity: 1 },
      ]);

      expect(await kitA.getKit(procedureA)).toHaveLength(2);
      expect(await kitA.countByProcedure()).toMatchObject({ [procedureA]: 2 });
      const stored = await admin.query<{ clinic_id: string }>(
        `SELECT DISTINCT clinic_id FROM procedure_supplies WHERE procedure_id = $1`,
        [procedureA],
      );
      expect(stored.rows).toEqual([{ clinic_id: CLINIC_A }]);

      const kitB = new DrizzleProcedureKitRepository(
        await scopeDbToClinic(appDb, CLINIC_B),
      );
      expect(await kitB.getKit(procedureA)).toEqual([]);
      expect(await kitB.countByProcedure()).not.toHaveProperty(procedureA);
    });

    it('Dado o procedimento da B, Quando a A tenta gravar o kit dele, Então o repositório recusa e nada é gravado', async () => {
      const kitA = new DrizzleProcedureKitRepository(
        await scopeDbToClinic(appDb, CLINIC_A),
      );

      await expect(
        kitA.setKit(procedureB, [{ supplyId: 'insumo-9', quantity: 1 }]),
      ).rejects.toThrow(/não encontrado/);
      expect(
        (
          await admin.query(
            `SELECT 1 FROM procedure_supplies WHERE procedure_id = $1`,
            [procedureB],
          )
        ).rowCount,
      ).toBe(0);
    });

    it('Dado o código anterior à etapa, Quando insere sem clinic_id, Então o gatilho completa com a clínica do procedimento', async () => {
      // Conexão comum: o `admin` do teste roda em `replica`, que desliga gatilhos.
      const legacy = new Pool({
        connectionString: withDatabase(baseUrl, databaseName),
        max: 1,
      });
      try {
        await legacy.query(
          `INSERT INTO procedure_supplies (procedure_id, supply_id, quantity) VALUES ($1, 'legado', 1)`,
          [procedureB],
        );
      } finally {
        await legacy.end();
      }

      const stored = await admin.query<{ clinic_id: string }>(
        `SELECT clinic_id FROM procedure_supplies WHERE supply_id = 'legado'`,
      );
      expect(stored.rows).toEqual([{ clinic_id: CLINIC_B }]);
    });

    it('Dado o banco real (com chaves estrangeiras), Quando o clinic_id diverge do procedimento, Então a chave composta recusa', async () => {
      const strict = new Pool({
        connectionString: withDatabase(baseUrl, databaseName),
        max: 1,
      });
      try {
        await expect(
          strict.query(
            `INSERT INTO procedure_supplies (procedure_id, clinic_id, supply_id, quantity)
             VALUES ($1, $2, 'divergente', 1)`,
            [procedureA, CLINIC_B],
          ),
        ).rejects.toThrow(/fk_procedure_supplies_procedure_clinic/);
      } finally {
        await strict.end();
      }
    });

    it('Dado procedimento inexistente, Quando insere kit, Então a chave estrangeira recusa e o gatilho não inventa clínica', async () => {
      const strict = new Pool({
        connectionString: withDatabase(baseUrl, databaseName),
        max: 1,
      });
      try {
        await expect(
          strict.query(
            `INSERT INTO procedure_supplies (procedure_id, supply_id, quantity) VALUES ('nao-existe', 'x', 1)`,
          ),
        ).rejects.toThrow(/null value in column "clinic_id"|violates/);
      } finally {
        await strict.end();
      }
    });
  });

  it('Dado as migrações aplicadas de novo, Quando reexecuto o SQL, Então segue uma política por tabela (idempotente)', async () => {
    const count = async () =>
      (
        await admin.query<{ n: string }>(
          `SELECT count(*) AS n FROM pg_policies WHERE schemaname = 'public'`,
        )
      ).rows[0]?.n;
    const before = await count();

    for (const file of SQL_FILES.slice(1)) {
      for (const statement of sqlOf(file)) await admin.query(statement);
    }

    expect(await count()).toBe(before);
    expect(await inClinic(CLINIC_A, clinicsOf('patients'))).toEqual([CLINIC_A]);
  });

  it('Dado o rollback documentado, Quando desligo o RLS de uma tabela, Então só ela volta a ser lida inteira, sem perda de dado', async () => {
    await admin.query(`ALTER TABLE invoices DISABLE ROW LEVEL SECURITY`);

    expect(await inClinic(null, clinicsOf('invoices'))).toEqual([
      CLINIC_A,
      CLINIC_B,
    ]);
    expect(await inClinic(null, clinicsOf('patients'))).toEqual([]);

    await admin.query(`ALTER TABLE invoices ENABLE ROW LEVEL SECURITY`);
    expect(await inClinic(null, clinicsOf('invoices'))).toEqual([]);
  });

  it('Dado o rollback de todas as tabelas, Quando desligo o RLS em lote, Então a aplicação volta a ver tudo', async () => {
    for (const table of covered) {
      await admin.query(
        `ALTER TABLE ${quoteIdent(table)} DISABLE ROW LEVEL SECURITY`,
      );
    }

    for (const table of covered) {
      expect(await inClinic(null, clinicsOf(table))).toEqual(
        table === 'procedure_supplies'
          ? expect.arrayContaining([CLINIC_A, CLINIC_B])
          : [CLINIC_A, CLINIC_B],
      );
    }
  });
});
