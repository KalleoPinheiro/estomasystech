import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachPoolErrorLogger,
  getDb,
  warmUpDatabase,
} from '@/infrastructure/persistence/drizzle/db';
import { loggedLines } from '../support/log-lines';

/**
 * Issue #193: `getDb` guardava a Promise rejeitada — uma falha transitória do
 * banco no primeiro acesso deixava a instância em 500 até reiniciar.
 */
const globalForDb = globalThis as unknown as {
  estomasystechDbPromise?: Promise<unknown>;
};

describe('Feature: getDb se recupera de falha na inicialização (#193)', () => {
  const saved = {
    driver: process.env.ESTOMASYSTECH_DB_DRIVER,
    url: process.env.DATABASE_URL,
    migrateOnBoot: process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT,
    promise: globalForDb.estomasystechDbPromise,
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalForDb.estomasystechDbPromise = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.ESTOMASYSTECH_DB_DRIVER = saved.driver;
    process.env.DATABASE_URL = saved.url;
    if (saved.migrateOnBoot === undefined) {
      delete process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT;
    } else {
      process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT = saved.migrateOnBoot;
    }
    globalForDb.estomasystechDbPromise = saved.promise;
  });

  it('C11 falha na primeira conexão não fica em cache', async () => {
    // Porta 1 no loopback: conexão recusada na hora (ECONNREFUSED).
    process.env.ESTOMASYSTECH_DB_DRIVER = 'postgres';
    process.env.DATABASE_URL =
      'postgres://estomasystech:x@127.0.0.1:1/estomasystech';

    await expect(getDb()).rejects.toThrow();
    expect(globalForDb.estomasystechDbPromise).toBeUndefined();

    // Banco "volta": a próxima chamada tenta de novo e conecta.
    process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
    const db = await getDb();

    expect(db).toBeDefined();
    expect(loggedLines(vi.mocked(console.error))).toContainEqual(
      expect.objectContaining({
        msg: 'Banco: falha ao inicializar a conexão/migração',
        error: expect.objectContaining({ code: 'ECONNREFUSED' }),
      }),
    );
  });

  it('C12 chamadas concorrentes compartilham a mesma tentativa', async () => {
    process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

    const first = getDb();
    const second = getDb();

    expect(second).toBe(first);
    await first;
  });

  it('C13 pool registra listener de erro', () => {
    const pool = new EventEmitter();

    attachPoolErrorLogger(pool);
    // Sem listener, `emit('error')` lançaria (e derrubaria o processo no pool real).
    pool.emit('error', new Error('conexão encerrada pelo servidor'));

    expect(pool.listenerCount('error')).toBe(1);
    expect(loggedLines(vi.mocked(console.error))).toContainEqual(
      expect.objectContaining({
        msg: 'Banco: erro em conexão ociosa do pool (descartada)',
        error: expect.objectContaining({
          message: 'conexão encerrada pelo servidor',
        }),
      }),
    );
  });

  // #212: o HEALTHCHECK (liveness) não toca o banco; a migração no boot vem daqui.
  it('C14 warm-up no boot conecta e migra sem esperar a primeira requisição', async () => {
    process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
    process.env.DATABASE_URL = 'postgres://ignorado-pelo-pglite';
    delete process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT;

    await warmUpDatabase();

    expect(globalForDb.estomasystechDbPromise).toBeDefined();
  });

  it('C15 warm-up com banco fora do ar não lança (getDb loga e tenta de novo depois)', async () => {
    process.env.ESTOMASYSTECH_DB_DRIVER = 'postgres';
    process.env.DATABASE_URL =
      'postgres://estomasystech:x@127.0.0.1:1/estomasystech';

    await expect(warmUpDatabase()).resolves.toBeUndefined();
    expect(globalForDb.estomasystechDbPromise).toBeUndefined();
  });

  it('C16 warm-up desligado sem DATABASE_URL ou com ESTOMASYSTECH_MIGRATE_ON_BOOT=false', async () => {
    process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
    delete process.env.DATABASE_URL;
    await warmUpDatabase();
    expect(globalForDb.estomasystechDbPromise).toBeUndefined();

    process.env.DATABASE_URL = 'postgres://ignorado-pelo-pglite';
    process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT = 'false';
    await warmUpDatabase();
    expect(globalForDb.estomasystechDbPromise).toBeUndefined();
  });
});
