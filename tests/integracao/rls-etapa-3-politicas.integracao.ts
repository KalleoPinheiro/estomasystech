import { readFileSync } from 'node:fs';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { scopeDbToClinic } from '@/infrastructure/persistence/drizzle/clinic-scoped-pool';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleSupplyRepository } from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import { DrizzlePartnerRepository } from '@/infrastructure/persistence/drizzle/drizzle-partner-repository';
import { DrizzleScheduleAvailabilityRepository } from '@/infrastructure/persistence/drizzle/drizzle-schedule-availability-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * RLS etapa 3 (#872, ADR-110): a migração 0076 liga a política `clinic_isolation` em `supplies`,
 * `partners` e `schedule_closures`. A prova usa o Postgres real: o PGlite roda como superusuário e
 * ignora a política. Os três atores do ADR são exercitados: o dono (como a produção conecta hoje), o
 * papel da aplicação (não dono, sem BYPASSRLS) e o papel de sistema (BYPASSRLS).
 */
const CLINIC_A = 'clinic-rls3-a';
const CLINIC_B = 'clinic-rls3-b';
const TABLES = ['supplies', 'partners', 'schedule_closures'] as const;
const APP_GROUP = 'estomasystech_app';
const MIGRATION = readFileSync(
  path.join(process.cwd(), 'drizzle', '0076_rls-politicas-baixo-risco.sql'),
  'utf8',
);
const createdAt = new Date('2026-11-16T10:00:00Z');

describe('Feature: políticas de RLS nas tabelas de baixo risco (#872)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls3_${process.pid}_${Date.now()}`;
  const appRole = `app_rls3_${process.pid}`;
  const systemRole = `sys_rls3_${process.pid}`;
  const password = 'senha-descartavel-rls3';
  let admin: Pool;
  let app: Pool;
  let system: Pool;
  let appDb: AppDb;

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
        `SELECT clinic_id FROM ${table} ORDER BY clinic_id`,
      )
      .then((result) => result.rows.map((row) => row.clinic_id));

  const adminClinicsOf = (table: string) =>
    admin
      .query<{ clinic_id: string }>(
        `SELECT clinic_id FROM ${table} ORDER BY clinic_id`,
      )
      .then((result) => result.rows.map((row) => row.clinic_id));

  const policies = async () =>
    (
      await admin.query<{ tablename: string; policyname: string }>(
        `SELECT tablename, policyname FROM pg_policies
          WHERE schemaname = 'public' ORDER BY tablename, policyname`,
      )
    ).rows;

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    const db = drizzle(admin, { schema });
    for (const [id, name] of [
      [CLINIC_A, 'Clínica A'],
      [CLINIC_B, 'Clínica B'],
    ]) {
      await db
        .insert(schema.clinics)
        .values({ id, name, createdAt, createdBy: 'teste' });
      await db.insert(schema.patients).values({
        id: `patient-${id}`,
        clinicId: id,
        fullName: `Paciente ${name}`,
        phone: '11999990000',
        createdAt,
      });
      await db.insert(schema.partners).values({
        id: `partner-${id}`,
        clinicId: id,
        fullName: `Parceiro ${name}`,
        email: `${id}@exemplo.test`,
        phone: '11999990001',
        createdAt,
      });
      await db.insert(schema.supplies).values({
        id: `supply-${id}`,
        clinicId: id,
        name: `Insumo ${name}`,
        unit: 'un',
        minQty: 1,
        priceCents: 100,
        createdAt,
      });
      await db.insert(schema.scheduleClosures).values({
        id: `closure-${id}`,
        clinicId: id,
        startsOn: '2026-12-25',
        endsOn: '2026-12-25',
        reason: `Natal ${name}`,
        createdAt,
      });
    }
    // Como o dono faria no servidor: logins que herdam o papel de grupo da etapa 1 (0075).
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

  it('Dado a migração, Quando leio o catálogo, Então só as três tabelas têm RLS ligado, sem FORCE', async () => {
    const rows = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        ORDER BY c.relname`,
    );
    expect(rows.rows).toEqual([
      {
        relname: 'partners',
        relrowsecurity: true,
        relforcerowsecurity: false,
      },
      {
        relname: 'schedule_closures',
        relrowsecurity: true,
        relforcerowsecurity: false,
      },
      { relname: 'supplies', relrowsecurity: true, relforcerowsecurity: false },
    ]);
    expect(await policies()).toEqual([
      { tablename: 'partners', policyname: 'clinic_isolation' },
      { tablename: 'schedule_closures', policyname: 'clinic_isolation' },
      { tablename: 'supplies', policyname: 'clinic_isolation' },
    ]);
  });

  it.each(TABLES)(
    'Dado %s, Quando o papel da aplicação consulta sem WHERE, Então vê só a clínica da transação',
    async (table) => {
      expect(await inClinic(CLINIC_A, clinicsOf(table))).toEqual([CLINIC_A]);
      expect(await inClinic(CLINIC_B, clinicsOf(table))).toEqual([CLINIC_B]);
    },
  );

  it.each(TABLES)(
    'Dado %s, Quando a transação não grava app.clinic_id, Então falha fechado (zero linhas)',
    async (table) => {
      expect(await inClinic(null, clinicsOf(table))).toEqual([]);
    },
  );

  it('Dado o pool de uma conexão, Quando a transação da A termina, Então a consulta seguinte, sem clínica, não vê nada', async () => {
    await inClinic(CLINIC_A, clinicsOf('supplies'));
    for (const table of TABLES) {
      expect((await app.query(`SELECT 1 FROM ${table}`)).rowCount).toBe(0);
    }
  });

  it.each(TABLES)(
    'Dado %s, Quando a clínica A tenta gravar ou mover linha para a B, Então WITH CHECK recusa',
    async (table) => {
      await expect(
        inClinic(CLINIC_A, (client) =>
          client.query(`UPDATE ${table} SET clinic_id = $1`, [CLINIC_B]),
        ),
      ).rejects.toThrow(/row-level security/);
    },
  );

  it('Dado a clínica A, Quando insiro em nome da B, Então a política recusa nas três tabelas', async () => {
    const inserts = [
      `INSERT INTO supplies (id, clinic_id, name, unit, min_qty, price_cents, created_at)
         VALUES ('invasor', '${CLINIC_B}', 'x', 'un', 1, 1, now())`,
      `INSERT INTO partners (id, clinic_id, full_name, email, phone, created_at)
         VALUES ('invasor', '${CLINIC_B}', 'x', 'x@exemplo.test', '11', now())`,
      `INSERT INTO schedule_closures (id, clinic_id, starts_on, ends_on, reason, created_at)
         VALUES ('invasor', '${CLINIC_B}', '2026-12-26', '2026-12-26', 'x', now())`,
    ];
    for (const insert of inserts) {
      await expect(
        inClinic(CLINIC_A, (client) => client.query(insert)),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it('Dado a clínica A, Quando atualizo e removo sem filtro, Então só afeto as linhas da A', async () => {
    const updated = await inClinic(CLINIC_A, (client) =>
      client.query(`UPDATE supplies SET min_qty = 2`),
    );
    expect(updated.rowCount).toBe(1);
    const removed = await inClinic(CLINIC_A, (client) =>
      client.query(`DELETE FROM schedule_closures`),
    );
    expect(removed.rowCount).toBe(1);
    expect(await adminClinicsOf('schedule_closures')).toEqual([CLINIC_B]);
    await admin.query(
      `INSERT INTO schedule_closures (id, clinic_id, starts_on, ends_on, reason, created_at)
       VALUES ('closure-${CLINIC_A}', '${CLINIC_A}', '2026-12-25', '2026-12-25', 'Natal', now())`,
    );
  });

  it.each(TABLES)(
    'Dado %s, Quando o papel de sistema (BYPASSRLS) lê sem clínica, Então vê todas as clínicas',
    async (table) => {
      expect(await inClinic(null, clinicsOf(table), system)).toEqual([
        CLINIC_A,
        CLINIC_B,
      ]);
    },
  );

  it.each(TABLES)(
    'Dado %s, Quando o dono da tabela (como a produção conecta hoje) lê, Então a política não o filtra',
    async (table) => {
      expect(await adminClinicsOf(table)).toEqual([CLINIC_A, CLINIC_B]);
    },
  );

  it('Dado as demais tabelas, Quando o papel da aplicação lê patients, Então a etapa 3 não mudou nada nelas', async () => {
    expect(await inClinic(null, clinicsOf('patients'))).toEqual([
      CLINIC_A,
      CLINIC_B,
    ]);
  });

  it('Dado os repositórios reais com o papel da aplicação, Quando listo com o escopo da A, Então só vejo a A', async () => {
    const scoped = await scopeDbToClinic(appDb, CLINIC_A);

    const partners = await new DrizzlePartnerRepository(
      scoped,
      CLINIC_A,
    ).findAll();
    const supplies = await new DrizzleSupplyRepository(
      scoped,
      CLINIC_A,
    ).findAll();
    const closures = await new DrizzleScheduleAvailabilityRepository(
      scoped,
      CLINIC_A,
    ).listClosures({ from: '2026-12-01', to: '2026-12-31' });

    expect(partners.map((p) => p.id)).toEqual([`partner-${CLINIC_A}`]);
    expect(supplies.map((s) => s.id)).toEqual([`supply-${CLINIC_A}`]);
    expect(closures.map((c) => c.id)).toEqual([`closure-${CLINIC_A}`]);
  });

  it('Dado o repositório de parceiros da A, Quando busco o id da B, Então a política devolve nada mesmo sem o filtro', async () => {
    const scoped = await scopeDbToClinic(appDb, CLINIC_A);
    const withoutFilter = new DrizzlePartnerRepository(scoped, null);

    expect(await withoutFilter.findById(`partner-${CLINIC_B}`)).toBeNull();
    expect((await withoutFilter.findAll()).map((p) => p.id)).toEqual([
      `partner-${CLINIC_A}`,
    ]);
  });

  it('Dado a migração aplicada de novo, Quando reexecuto o SQL, Então segue uma política por tabela (idempotente)', async () => {
    const before = await policies();

    await admin.query(MIGRATION.replaceAll('--> statement-breakpoint', ''));

    expect(await policies()).toEqual(before);
    expect(await inClinic(CLINIC_A, clinicsOf('partners'))).toEqual([CLINIC_A]);
  });

  it('Dado o rollback documentado, Quando desligo o RLS das três tabelas, Então a aplicação volta a ver tudo, sem perda de dado', async () => {
    for (const table of TABLES) {
      await admin.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }

    for (const table of TABLES) {
      expect(await inClinic(null, clinicsOf(table))).toEqual([
        CLINIC_A,
        CLINIC_B,
      ]);
    }

    for (const table of TABLES) {
      await admin.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(await inClinic(null, clinicsOf('supplies'))).toEqual([]);
  });
});
