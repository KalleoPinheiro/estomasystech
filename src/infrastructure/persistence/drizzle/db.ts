import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { logError } from '@/lib/log-error';
import * as schema from './schema';

export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Teto de linhas por listagem — protege o banco de queries sem limite (paginação real: P1). */
export const MAX_ROWS = 500;

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

const globalForDb = globalThis as unknown as {
  vittaDbPromise?: Promise<AppDb>;
};

async function createPgliteDb(): Promise<AppDb> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { btree_gist } = await import(
    '@electric-sql/pglite/contrib/btree_gist'
  );
  const { drizzle } = await import('drizzle-orm/pglite');

  // Suíte de testes (tests/support/pglite-global-setup.ts) migra 1x pra todo
  // o processo e expõe o dump aqui — pula o `migrate()` (parsing+execução de
  // todo o SQL de schema, o maior custo de tempo/máquina da suíte, issue
  // #111) sem abrir mão de uma instância PGlite nova e isolada por arquivo.
  const templatePath = process.env.VITTA_PGLITE_TEMPLATE_PATH;
  if (templatePath) {
    const fs = await import('node:fs/promises');
    const buffer = await fs.readFile(templatePath);
    const client = new PGlite({
      loadDataDir: new Blob([buffer]),
      extensions: { pg_trgm, btree_gist },
    });
    return drizzle(client, { schema }) as unknown as AppDb;
  }

  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite({ extensions: { pg_trgm, btree_gist } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as AppDb;
}

/** Lock consultivo compartilhado pelas réplicas — evita corrida de DDL no boot. */
const MIGRATION_LOCK_KEY = 727_001;

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

interface ErrorEmitter {
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/**
 * Erro de cliente ocioso do pool (banco reiniciou, conexão cortada) é emitido
 * como evento `error`; sem listener, o Node derruba o processo inteiro (#193).
 * O cliente com erro é descartado pelo próprio pool.
 */
export function attachPoolErrorLogger(pool: ErrorEmitter): void {
  pool.on('error', (error) => {
    logError('Banco: erro em conexão ociosa do pool (descartada)', error);
  });
}

async function createPostgresDb(): Promise<AppDb> {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { Pool } = await import('pg');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada');
  }
  const pool = new Pool({
    connectionString,
    max: intFromEnv('PG_POOL_MAX', 10),
    connectionTimeoutMillis: intFromEnv('PG_CONNECT_TIMEOUT_MS', 5_000),
    idleTimeoutMillis: intFromEnv('PG_IDLE_TIMEOUT_MS', 30_000),
    statement_timeout: intFromEnv('PG_STATEMENT_TIMEOUT_MS', 15_000),
  });
  attachPoolErrorLogger(pool);
  const db = drizzle(pool, { schema });

  // Preferir `npm run db:migrate` no deploy; VITTA_MIGRATE_ON_BOOT=false desliga o boot-migrate.
  if (process.env.VITTA_MIGRATE_ON_BOOT !== 'false') {
    try {
      await migrateWithLock(pool, db);
    } catch (error) {
      // Sem isto cada nova tentativa de getDb deixaria um pool órfão aberto.
      await pool.end().catch(() => undefined);
      throw error;
    }
  }
  return db as unknown as AppDb;
}

async function migrateWithLock(
  pool: import('pg').Pool,
  db: Parameters<
    typeof import('drizzle-orm/node-postgres/migrator').migrate
  >[0],
): Promise<void> {
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}

/**
 * Conexão única por processo. Uma falha na inicialização (banco reiniciando,
 * rede, timeout, migração) NÃO fica em cache (#193): a Promise rejeitada é
 * descartada e a próxima chamada tenta de novo — antes, a instância ficava em
 * 500 permanente até reiniciar. Chamadas simultâneas compartilham a mesma
 * tentativa (um pool só). A falha é logada alto a cada tentativa.
 */
export function getDb(): Promise<AppDb> {
  if (!globalForDb.vittaDbPromise) {
    const attempt = (
      process.env.VITTA_DB_DRIVER === 'pglite'
        ? createPgliteDb()
        : createPostgresDb()
    ).catch((error: unknown) => {
      if (globalForDb.vittaDbPromise === attempt) {
        globalForDb.vittaDbPromise = undefined;
      }
      logError('Banco: falha ao inicializar a conexão/migração', error);
      throw error;
    });
    globalForDb.vittaDbPromise = attempt;
  }
  return globalForDb.vittaDbPromise;
}
