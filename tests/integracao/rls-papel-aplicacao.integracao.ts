import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * RLS etapa 1 (#870, ADR-110): a migração 0075 cria o papel `estomasystech_app` (sem dono, sem
 * BYPASSRLS, sem login) com só o privilégio de DML. Nenhuma política é ligada nesta etapa.
 */
const APP_ROLE = 'estomasystech_app';
const MIGRATION = readFileSync(
  path.join(process.cwd(), 'drizzle', '0075_rls-papel-aplicacao.sql'),
  'utf8',
);

describe('Feature: papel de aplicação do RLS (#870)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls1_${process.pid}_${Date.now()}`;
  const loginRole = `app_login_${process.pid}`;
  const password = 'senha-descartavel-rls1';
  let admin: Pool;
  let login: Pool;

  const scalar = async (sql: string, params: unknown[] = []) =>
    (await admin.query(sql, params)).rows[0] as Record<string, unknown>;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    // Como o dono faria no servidor: papel de login que herda o papel de grupo.
    await admin.query(
      `CREATE ROLE ${quoteIdent(loginRole)} LOGIN PASSWORD '${password}' IN ROLE ${APP_ROLE}`,
    );
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = loginRole;
    url.password = password;
    login = new Pool({ connectionString: url.toString(), max: 1 });
  });

  afterAll(async () => {
    // O papel de grupo é do cluster (compartilhado por todos os bancos clonados): só o de login sai.
    for (const step of [
      () => login?.end(),
      () => admin?.end(),
      () =>
        adminQuery(
          baseUrl,
          `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
        ),
      () => adminQuery(baseUrl, `DROP ROLE IF EXISTS ${quoteIdent(loginRole)}`),
    ]) {
      await Promise.resolve(step()).catch(() => undefined);
    }
  });

  it('Dado a migração, Quando leio o papel, Então não é super, não ignora RLS, não loga e não cria nada', async () => {
    const role = await scalar(
      `SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb, rolreplication
         FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
    });
  });

  it('Dado o papel, Quando listo as tabelas, Então ele não é dono de nenhuma', async () => {
    const owned = await admin.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = $1`,
      [APP_ROLE],
    );
    expect(owned.rows).toEqual([]);
  });

  it('Dado o papel, Quando confiro privilégios, Então tem só SELECT, INSERT, UPDATE e DELETE nas tabelas', async () => {
    const tables = (
      await admin.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      )
    ).rows.map((row) => row.tablename);
    expect(tables.length).toBeGreaterThan(40);
    for (const table of tables) {
      const grants = await scalar(
        `SELECT
           (has_table_privilege($1, $2, 'SELECT') AND has_table_privilege($1, $2, 'INSERT')
             AND has_table_privilege($1, $2, 'UPDATE') AND has_table_privilege($1, $2, 'DELETE')) AS dml,
           has_table_privilege($1, $2, 'TRUNCATE') AS truncate,
           has_table_privilege($1, $2, 'REFERENCES') AS refs,
           has_table_privilege($1, $2, 'TRIGGER') AS trigger`,
        [APP_ROLE, `public.${table}`],
      );
      expect({ table, ...grants }).toEqual({
        table,
        dml: true,
        truncate: false,
        refs: false,
        trigger: false,
      });
    }
  });

  it('Dado o papel, Quando confiro os esquemas, Então não cria no public nem enxerga o controle de migração', async () => {
    const schemas = await scalar(
      `SELECT
         has_schema_privilege($1, 'public', 'USAGE') AS usa_public,
         has_schema_privilege($1, 'public', 'CREATE') AS cria_public,
         has_schema_privilege($1, 'drizzle', 'USAGE') AS usa_drizzle`,
      [APP_ROLE],
    );
    expect(schemas).toEqual({
      usa_public: true,
      cria_public: false,
      usa_drizzle: false,
    });
  });

  it('Dado um login que herda o papel, Quando lê e grava, Então funciona; Quando tenta DDL, Então é recusado', async () => {
    await admin.query(
      `INSERT INTO clinics (id, name, created_at, created_by) VALUES ('clinic-rls1', 'Clínica RLS1', now(), 'teste')`,
    );
    const read = await login.query(
      `SELECT id FROM clinics WHERE id = 'clinic-rls1'`,
    );
    expect(read.rowCount).toBe(1);
    await login.query(
      `UPDATE clinics SET name = 'Clínica RLS1b' WHERE id = 'clinic-rls1'`,
    );
    await expect(login.query('TRUNCATE clinics')).rejects.toThrow(
      /permission denied/,
    );
    await expect(login.query('DROP TABLE clinics')).rejects.toThrow(
      /must be owner/,
    );
    await expect(login.query('CREATE TABLE intruso (id int)')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      login.query('SELECT * FROM drizzle.__drizzle_migrations'),
    ).rejects.toThrow(/permission denied/);
    await login.query(`DELETE FROM clinics WHERE id = 'clinic-rls1'`);
  });

  it('Dado uma tabela criada depois, Quando o dono a cria, Então o papel já a enxerga (default privileges)', async () => {
    await admin.query('CREATE TABLE rls1_futura (id int PRIMARY KEY)');
    const grants = await scalar(
      `SELECT (has_table_privilege($1, 'public.rls1_futura', 'SELECT') AND has_table_privilege($1, 'public.rls1_futura', 'INSERT')
         AND has_table_privilege($1, 'public.rls1_futura', 'UPDATE') AND has_table_privilege($1, 'public.rls1_futura', 'DELETE')) AS dml`,
      [APP_ROLE],
    );
    expect(grants).toEqual({ dml: true });
    await admin.query('DROP TABLE rls1_futura');
  });

  it('Dado a migração rodada de novo, Então é idempotente e não muda o papel', async () => {
    await admin.query(MIGRATION);
    await admin.query(MIGRATION);
    const role = await scalar(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('Dado o caminho de volta documentado, Quando rodo DROP OWNED, Então os privilégios somem e as tabelas ficam intactas', async () => {
    const clone = `it_rls1_back_${process.pid}_${Date.now()}`;
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(clone)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    const pool = new Pool({
      connectionString: withDatabase(baseUrl, clone),
      max: 1,
    });
    try {
      await pool.query(`DROP OWNED BY ${APP_ROLE}`);
      const after = await pool.query(
        `SELECT has_table_privilege($1, 'public.clinics', 'SELECT') AS le,
                (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')::int AS tabelas`,
        [APP_ROLE],
      );
      expect(after.rows[0]).toMatchObject({ le: false });
      expect(after.rows[0].tabelas).toBeGreaterThan(40);
    } finally {
      await pool.end();
      await adminQuery(
        baseUrl,
        `DROP DATABASE IF EXISTS ${quoteIdent(clone)} WITH (FORCE)`,
      );
    }
  });
});
