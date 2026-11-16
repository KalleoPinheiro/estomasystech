import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

/**
 * RLS etapa 5, preparo (#889, ADR-110): com a `DATABASE_URL` no papel da aplicação (sem dono, sem
 * BYPASSRLS) e a `DATABASE_SYSTEM_URL` no papel de sistema, o app sobe sem migrar, o readiness fica
 * verde (e continua verdadeiro) e as consultas de clínica seguem isoladas. Postgres real: o PGlite não
 * aplica papéis nem RLS.
 */
describe('Feature: app conectado com o papel restrito do banco (#889)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_rls5_${process.pid}_${Date.now()}`;
  const appLogin = `app_login_${process.pid}`;
  const systemLogin = `sistema_login_${process.pid}`;
  const password = 'senha-descartavel-rls5';
  const saved = { ...process.env };
  let admin: Pool;
  let appPool: Pool;

  const urlFor = (user: string) => {
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = user;
    url.password = password;
    return url.toString();
  };

  const loadModules = async () => {
    // O setup da suíte troca `getDb` pelo banco do arquivo; aqui o que se prova é o `getDb` real.
    vi.doUnmock('@/infrastructure/persistence/drizzle/db');
    vi.resetModules();
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.estomasystechDbPromise = undefined;
    globals.estomasystechSystemDbPromise = undefined;
    const db = await import('@/infrastructure/persistence/drizzle/db');
    const readiness = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );
    const scoped = await import(
      '@/infrastructure/persistence/drizzle/clinic-scoped-pool'
    );
    return { ...db, ...readiness, ...scoped };
  };

  const logged = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

  beforeAll(async () => {
    await adminQuery(
      baseUrl,
      `CREATE DATABASE ${quoteIdent(databaseName)} TEMPLATE ${quoteIdent(inject('integrationTemplate'))}`,
    );
    admin = new Pool({
      connectionString: withDatabase(baseUrl, databaseName),
      max: 1,
    });
    await admin.query(
      `CREATE ROLE ${quoteIdent(appLogin)} LOGIN PASSWORD '${password}' IN ROLE estomasystech_app`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(systemLogin)} LOGIN BYPASSRLS PASSWORD '${password}' IN ROLE estomasystech_app`,
    );
    appPool = new Pool({ connectionString: urlFor(appLogin), max: 1 });
    const seed = drizzle(admin, { schema });
    for (const id of ['clinica-a', 'clinica-b']) {
      await seed.insert(schema.clinics).values({
        id,
        name: id,
        createdAt: new Date('2026-11-16T10:00:00Z'),
        createdBy: 'teste',
      });
      await seed.insert(schema.patients).values({
        id: `paciente-${id}`,
        clinicId: id,
        fullName: `Paciente ${id}`,
        phone: '11999990000',
        createdAt: new Date('2026-11-16T10:00:00Z'),
      });
    }
    process.env.ESTOMASYSTECH_DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = urlFor(appLogin);
    process.env.DATABASE_SYSTEM_URL = urlFor(systemLogin);
    delete process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT;
  });

  afterAll(async () => {
    process.env = saved;
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.estomasystechDbPromise = undefined;
    globals.estomasystechSystemDbPromise = undefined;
    await appPool?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    ).catch(() => undefined);
    for (const role of [appLogin, systemLogin]) {
      await adminQuery(
        baseUrl,
        `DROP ROLE IF EXISTS ${quoteIdent(role)}`,
      ).catch(() => undefined);
    }
  });

  it('Dado o papel da aplicação, Quando leio o esquema drizzle direto, Então é negado (menor privilégio)', async () => {
    await expect(
      appPool.query('select created_at from drizzle.__drizzle_migrations'),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      appPool.query('create table t_x (id int)'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('Dado a DATABASE_URL no papel da aplicação, Quando o app sobe, Então pula o boot-migrate com aviso e conecta', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { getDb } = await loadModules();

    const db = await getDb();
    const who = await db.execute(sql`select current_user as u`);

    expect((who as unknown as { rows: { u: string }[] }).rows[0]?.u).toBe(
      appLogin,
    );
    expect(`${logged(warn)}\n${logged(log)}`).toContain('boot-migrate pulado');
    warn.mockRestore();
    log.mockRestore();
  });

  it('Dado o app no papel restrito e o esquema migrado, Quando checo o readiness, Então fica verde', async () => {
    const { checkReadiness } = await loadModules();

    expect(await checkReadiness()).toEqual({
      ready: true,
      database: 'ok',
      migrations: 'ok',
    });
  });

  it('Dado o app no papel restrito, Quando leio por clínica, Então vê só a própria; o pool de sistema vê todas', async () => {
    const { getDb, getSystemDb, scopeDbToClinic } = await loadModules();
    const app = await getDb();
    const read = async (db: Awaited<ReturnType<typeof getDb>>) =>
      (await db.select({ id: schema.patients.id }).from(schema.patients))
        .map((row) => row.id)
        .sort();

    expect(await read(await scopeDbToClinic(app, 'clinica-a'))).toEqual([
      'paciente-clinica-a',
    ]);
    expect(await read(await scopeDbToClinic(app, 'clinica-b'))).toEqual([
      'paciente-clinica-b',
    ]);
    expect(await read(app)).toEqual([]);
    expect(await read(await getSystemDb())).toEqual([
      'paciente-clinica-a',
      'paciente-clinica-b',
    ]);
  });

  it('Dado uma migração do diretório não aplicada, Quando checo o readiness no papel restrito, Então continua 503 (não é um health que sempre diz ok)', async () => {
    await admin.query(
      'delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)',
    );
    const { checkReadiness } = await loadModules();

    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'ok',
      migrations: 'pending',
    });
  });

  it('Dado o banco sem a função de leitura (0080 não aplicada), Quando checo, Então pendente', async () => {
    await admin.query('drop function public.app__drizzle_migrations()');
    const { checkReadiness } = await loadModules();

    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'ok',
      migrations: 'pending',
    });
  });
});
