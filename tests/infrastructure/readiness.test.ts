import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * Abre o PGlite do registro de módulos atual antes da checagem: carregar o
 * snapshot (~1 s ocioso) sob carga comeria o prazo de 3 s. Cada teste que usa
 * o banco real chama isto, porque o `afterEach` zera o registro e descarta a
 * instância aquecida (#359).
 */
async function warmDatabase() {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  return getDb();
}

describe('Feature: readiness do banco (#212, OBS-02)', () => {
  afterEach(() => {
    vi.doUnmock('@/infrastructure/persistence/drizzle/db');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('Dado todas as migrações aplicadas, Quando checa, Então pronto', async () => {
    await warmDatabase();
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect(await checkReadiness()).toEqual({
      ready: true,
      database: 'ok',
      migrations: 'ok',
    });
  });

  it('Dado uma migração do diretório que não está no banco, Quando checa, Então pendente', async () => {
    const db = await warmDatabase();
    await db.execute(
      sql`delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`,
    );
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'ok',
      migrations: 'pending',
    });
  });

  it('Dado banco que não conecta, Quando checa, Então falha sem vazar a mensagem', async () => {
    vi.resetModules();
    vi.doMock('@/infrastructure/persistence/drizzle/db', () => ({
      MIGRATIONS_FOLDER: '/nao/existe',
      getDb: () =>
        Promise.reject(
          new Error('connect ECONNREFUSED postgres://estomasystech:senha@db'),
        ),
    }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'fail',
      migrations: 'unknown',
    });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('Dado banco que não responde, Quando passa o prazo, Então falha', async () => {
    vi.resetModules();
    vi.doMock('@/infrastructure/persistence/drizzle/db', () => ({
      MIGRATIONS_FOLDER: '/nao/existe',
      getDb: () => new Promise(() => {}),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect(await checkReadiness(20)).toMatchObject({
      ready: false,
      database: 'fail',
    });
  });

  it('Dado o diário de migrações ilegível, Quando checa, Então falha e tenta de novo na próxima', async () => {
    vi.resetModules();
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock('@/infrastructure/persistence/drizzle/db', () => ({
      MIGRATIONS_FOLDER: '/nao/existe',
      getDb: async () => ({ execute }),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect((await checkReadiness()).ready).toBe(false);
    expect((await checkReadiness()).database).toBe('fail');
  });

  it('Dado resultado sem linhas, Quando checa, Então trata como nada aplicado', async () => {
    vi.resetModules();
    const real = await vi.importActual<
      typeof import('@/infrastructure/persistence/drizzle/db')
    >('@/infrastructure/persistence/drizzle/db');
    vi.doMock('@/infrastructure/persistence/drizzle/db', () => ({
      MIGRATIONS_FOLDER: real.MIGRATIONS_FOLDER,
      getDb: async () => ({ execute: async () => ({}) }),
    }));
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'ok',
      migrations: 'pending',
    });
  });
});
