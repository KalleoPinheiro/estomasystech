import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachPoolErrorLogger,
  getDb,
} from '@/infrastructure/persistence/drizzle/db';

/**
 * Issue #193: `getDb` guardava a Promise rejeitada — uma falha transitória do
 * banco no primeiro acesso deixava a instância em 500 até reiniciar.
 */
const globalForDb = globalThis as unknown as {
  vittaDbPromise?: Promise<unknown>;
};

describe('Feature: getDb se recupera de falha na inicialização (#193)', () => {
  const saved = {
    driver: process.env.VITTA_DB_DRIVER,
    url: process.env.DATABASE_URL,
    promise: globalForDb.vittaDbPromise,
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalForDb.vittaDbPromise = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.VITTA_DB_DRIVER = saved.driver;
    process.env.DATABASE_URL = saved.url;
    globalForDb.vittaDbPromise = saved.promise;
  });

  it('C11 falha na primeira conexão não fica em cache', async () => {
    // Porta 1 no loopback: conexão recusada na hora (ECONNREFUSED).
    process.env.VITTA_DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = 'postgres://vitta:x@127.0.0.1:1/vitta';

    await expect(getDb()).rejects.toThrow();
    expect(globalForDb.vittaDbPromise).toBeUndefined();

    // Banco "volta": a próxima chamada tenta de novo e conecta.
    process.env.VITTA_DB_DRIVER = 'pglite';
    const db = await getDb();

    expect(db).toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      'Banco: falha ao inicializar a conexão/migração',
      expect.objectContaining({ code: 'ECONNREFUSED' }),
    );
  });

  it('C12 chamadas concorrentes compartilham a mesma tentativa', async () => {
    process.env.VITTA_DB_DRIVER = 'pglite';

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
    expect(console.error).toHaveBeenCalledWith(
      'Banco: erro em conexão ociosa do pool (descartada)',
      expect.objectContaining({ message: 'conexão encerrada pelo servidor' }),
    );
  });
});
