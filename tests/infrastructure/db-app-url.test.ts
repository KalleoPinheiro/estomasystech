import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, warmUpDatabase } from '@/infrastructure/persistence/drizzle/db';
import { loggedLines } from '../support/log-lines';

const globalForDb = globalThis as unknown as {
  estomasystechDbPromise?: Promise<unknown>;
};

/**
 * ADR-110: `getDb` lê `DATABASE_APP_URL` (login restrito, variável própria porque a `DATABASE_URL` da
 * Vercel é gerenciada pela integração do Neon) e cai em `DATABASE_URL` quando ela não existe. O
 * destino é distinguido pela porta recusada (loopback, ECONNREFUSED na hora).
 */
describe('Feature: getDb escolhe DATABASE_APP_URL (ADR-110)', () => {
  const keys = [
    'ESTOMASYSTECH_DB_DRIVER',
    'ESTOMASYSTECH_MIGRATE_ON_BOOT',
    'DATABASE_URL',
    'DATABASE_APP_URL',
    'PRODUCTION_DB_HOSTS',
  ] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const savedPromise = globalForDb.estomasystechDbPromise;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalForDb.estomasystechDbPromise = undefined;
    process.env.ESTOMASYSTECH_DB_DRIVER = 'postgres';
    delete process.env.ESTOMASYSTECH_MIGRATE_ON_BOOT;
    delete process.env.PRODUCTION_DB_HOSTS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    globalForDb.estomasystechDbPromise = savedPromise;
  });

  it('Dado DATABASE_APP_URL e DATABASE_URL, Quando conecto, Então tenta a DATABASE_APP_URL', async () => {
    process.env.DATABASE_URL = 'postgres://u:x@127.0.0.1:1/db';
    process.env.DATABASE_APP_URL = 'postgres://u:x@127.0.0.1:2/db';
    await expect(getDb()).rejects.toThrow(/127\.0\.0\.1:2\b/);
  });

  it('Dado DATABASE_APP_URL vazia, Quando conecto, Então tenta a DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgres://u:x@127.0.0.1:1/db';
    process.env.DATABASE_APP_URL = '  ';
    await expect(getDb()).rejects.toThrow(/127\.0\.0\.1:1\b/);
  });

  it('Dado só DATABASE_APP_URL, Quando o warm-up roda, Então ele tenta conectar', async () => {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_APP_URL = 'postgres://u:x@127.0.0.1:2/db';
    await warmUpDatabase();
    expect(loggedLines(vi.mocked(console.error))).toContainEqual(
      expect.objectContaining({
        msg: 'Banco: falha ao inicializar a conexão/migração',
      }),
    );
  });

  it('Dado nenhuma das duas, Quando o warm-up roda, Então não conecta', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_APP_URL;
    await warmUpDatabase();
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  });

  it('Dado DATABASE_APP_URL no host de produção, Quando conecto, Então a trava recusa', async () => {
    process.env.DATABASE_URL = 'postgres://u:x@127.0.0.1:1/db';
    process.env.DATABASE_APP_URL = 'postgres://u:x@banco.prod.exemplo.com/db';
    process.env.PRODUCTION_DB_HOSTS = 'banco.prod.exemplo.com';
    await expect(getDb()).rejects.toThrow('Banco de produção recusado');
  });
});
