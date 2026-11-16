import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { logError } from '@/lib/log-error';
import { getDb, MIGRATIONS_FOLDER } from './db';

/**
 * Prontidão do app (#212, `GET /api/health/ready`): o banco responde e todas
 * as migrações do diretório `drizzle/` estão aplicadas. O resultado só diz
 * ok/falha — nada de mensagem do driver, host ou string de conexão.
 */
export interface ReadinessReport {
  ready: boolean;
  database: 'ok' | 'fail';
  migrations: 'ok' | 'pending' | 'unknown';
}

/** Abaixo do `timeout` de 5s do HEALTHCHECK e de um verificador externo. */
const READINESS_TIMEOUT_MS = 3_000;

interface Journal {
  entries: { when: number; tag: string }[];
}

let journalWhen: Promise<number[]> | null = null;

/** Carimbo de cada migração do diretório; o Drizzle grava o mesmo valor em `created_at`. */
function expectedMigrations(): Promise<number[]> {
  journalWhen ??= readFile(
    path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json'),
    'utf8',
  )
    .then((raw) => (JSON.parse(raw) as Journal).entries.map((e) => e.when))
    .catch((error: unknown) => {
      journalWhen = null;
      throw error;
    });
  return journalWhen;
}

function rowsOf(result: unknown): Record<string, unknown>[] {
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/**
 * `undefined_table` (42P01) ou `undefined_function` (42883); o Drizzle embrulha o erro do driver em
 * `cause`. Qualquer outro código, `42501` (permissão negada) inclusive, segue como falha.
 */
function isNeverMigrated(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 4; depth++) {
    const err = e as { code?: unknown; cause?: unknown };
    if (err.code === '42P01' || err.code === '42883') return true;
    e = err.cause;
  }
  return false;
}

/**
 * Migrações aplicadas, lidas pela função `public.app__drizzle_migrations()` (migração 0080, ADR-110): o
 * papel da aplicação não enxerga o esquema `drizzle`, e a função devolve só os carimbos. Banco nunca
 * migrado (sem a tabela de controle) ou ainda sem a 0080 (sem a função): nada aplicado, logo pendente.
 */
async function appliedMigrations(
  db: Awaited<ReturnType<typeof getDb>>,
): Promise<Set<number>> {
  try {
    const result = await db.execute(
      sql`select created_at from public.app__drizzle_migrations() as t(created_at)`,
    );
    return new Set(rowsOf(result).map((row) => Number(row.created_at)));
  } catch (error) {
    if (isNeverMigrated(error)) return new Set();
    throw error;
  }
}

async function probe(): Promise<ReadinessReport> {
  const db = await getDb();
  await db.execute(sql`select 1`);
  const applied = await appliedMigrations(db);
  const expected = await expectedMigrations();
  const pending = expected.some((when) => !applied.has(when));
  return {
    ready: !pending,
    database: 'ok',
    migrations: pending ? 'pending' : 'ok',
  };
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`readiness: sem resposta em ${ms} ms`)),
      ms,
    );
    timer.unref?.();
  });
}

export async function checkReadiness(
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<ReadinessReport> {
  try {
    return await Promise.race([probe(), timeout(timeoutMs)]);
  } catch (error) {
    logError('Readiness: banco indisponível', error);
    return { ready: false, database: 'fail', migrations: 'unknown' };
  }
}
