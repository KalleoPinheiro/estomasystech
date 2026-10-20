import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import * as schema from '@/infrastructure/persistence/drizzle/schema';

/**
 * Suíte de integração contra Postgres real (issue #404, `npm run test:integracao`).
 * O Postgres migrado 1x vira um banco-modelo (tests/support/postgres-global-setup.ts) e cada
 * arquivo de teste recebe o próprio banco clonado dele (`CREATE DATABASE ... TEMPLATE`): o mesmo
 * isolamento por arquivo que o PGlite dá, só que no motor de produção.
 */

export function withDatabase(
  connectionString: string,
  database: string,
): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Executa um comando administrativo (CREATE/DROP DATABASE) numa conexão avulsa. */
export async function adminQuery(
  connectionString: string,
  sql: string,
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

interface FileDb {
  name: string;
  pool: Pool;
  db: AppDb;
}

const globalForFileDb = globalThis as unknown as {
  estomasystechIntegrationDb?: Promise<FileDb>;
};

let sequence = 0;

async function createFileDb(
  baseUrl: string,
  template: string,
): Promise<FileDb> {
  sequence += 1;
  const name = `it_${process.pid}_${Date.now()}_${sequence}`;
  await adminQuery(
    baseUrl,
    `CREATE DATABASE ${quoteIdent(name)} TEMPLATE ${quoteIdent(template)}`,
  );
  const pool = new Pool({
    connectionString: withDatabase(baseUrl, name),
    max: Number(process.env.PG_POOL_MAX) || 3,
  });
  return { name, pool, db: drizzle(pool, { schema }) as unknown as AppDb };
}

/**
 * Banco do arquivo de teste atual. Guardado em `globalThis` como o `getDb()` real, para
 * sobreviver a `vi.resetModules()`.
 */
export function getFileDb(baseUrl: string, template: string): Promise<AppDb> {
  globalForFileDb.estomasystechIntegrationDb ??= createFileDb(
    baseUrl,
    template,
  );
  return globalForFileDb.estomasystechIntegrationDb.then((file) => file.db);
}

export async function dropFileDb(baseUrl: string): Promise<void> {
  const pending = globalForFileDb.estomasystechIntegrationDb;
  globalForFileDb.estomasystechIntegrationDb = undefined;
  if (!pending) {
    return;
  }
  const file = await pending;
  await file.pool.end();
  await adminQuery(
    baseUrl,
    `DROP DATABASE IF EXISTS ${quoteIdent(file.name)} WITH (FORCE)`,
  );
}
