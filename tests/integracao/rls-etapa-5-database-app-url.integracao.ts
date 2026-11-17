import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import {
  adminQuery,
  quoteIdent,
  withDatabase,
} from '../support/postgres-integration';

/**
 * ADR-110, variável própria do login restrito: na Vercel a `DATABASE_URL` é gerenciada pela integração
 * do Neon (dono, não editável). `DATABASE_APP_URL`, quando definida, é a conexão normal de runtime;
 * sem ela (ou vazia) vale a `DATABASE_URL`. Postgres real: o PGlite não tem papéis.
 */
describe('Feature: DATABASE_APP_URL é a conexão de runtime com fallback (ADR-110)', () => {
  const baseUrl = inject('integrationDatabaseUrl');
  const databaseName = `it_appurl_${process.pid}_${Date.now()}`;
  const ownerLogin = `dono_login_${process.pid}`;
  const appLogin = `app_login_${process.pid}`;
  const password = 'senha-descartavel-appurl';
  const saved = { ...process.env };
  let admin: Pool;

  const urlFor = (user: string) => {
    const url = new URL(withDatabase(baseUrl, databaseName));
    url.username = user;
    url.password = password;
    return url.toString();
  };

  const currentUser = async (): Promise<string> => {
    vi.doUnmock('@/infrastructure/persistence/drizzle/db');
    vi.resetModules();
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.estomasystechDbPromise = undefined;
    globals.estomasystechSystemDbPromise = undefined;
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const db = await getDb();
    const who = await db.execute(sql`select current_user as u`);
    return (who as unknown as { rows: { u: string }[] }).rows[0]?.u ?? '';
  };

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
      `CREATE ROLE ${quoteIdent(ownerLogin)} LOGIN CREATEDB PASSWORD '${password}'`,
    );
    await admin.query(
      `CREATE ROLE ${quoteIdent(appLogin)} LOGIN PASSWORD '${password}' IN ROLE estomasystech_app`,
    );
    await admin.query(
      `GRANT ALL ON DATABASE ${quoteIdent(databaseName)} TO ${quoteIdent(ownerLogin)}`,
    );
    process.env.ESTOMASYSTECH_DB_DRIVER = 'postgres';
    process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT = 'false';
    delete process.env.DATABASE_SYSTEM_URL;
    process.env.DATABASE_URL = urlFor(ownerLogin);
  });

  afterAll(async () => {
    process.env = saved;
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.estomasystechDbPromise = undefined;
    globals.estomasystechSystemDbPromise = undefined;
    await admin?.end().catch(() => undefined);
    await adminQuery(
      baseUrl,
      `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE)`,
    ).catch(() => undefined);
    for (const role of [ownerLogin, appLogin]) {
      await adminQuery(
        baseUrl,
        `DROP ROLE IF EXISTS ${quoteIdent(role)}`,
      ).catch(() => undefined);
    }
  });

  it('Dado DATABASE_APP_URL definida, Quando o app conecta, Então o usuário é o login restrito, não o da DATABASE_URL', async () => {
    process.env.DATABASE_APP_URL = urlFor(appLogin);
    expect(await currentUser()).toBe(appLogin);
  });

  it('Dado DATABASE_APP_URL ausente, Quando o app conecta, Então o usuário é o da DATABASE_URL', async () => {
    delete process.env.DATABASE_APP_URL;
    expect(await currentUser()).toBe(ownerLogin);
  });

  it('Dado DATABASE_APP_URL vazia, Quando o app conecta, Então o usuário é o da DATABASE_URL', async () => {
    process.env.DATABASE_APP_URL = '  ';
    expect(await currentUser()).toBe(ownerLogin);
  });
});
