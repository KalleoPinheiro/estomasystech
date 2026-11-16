import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * #889 (ADR-110): o readiness lê as migrações pela função `public.app__drizzle_migrations()` (migração
 * 0080), porque o papel da aplicação não enxerga o esquema `drizzle`. A prova com papel de verdade está em
 * `tests/integracao/rls-etapa-5-readiness-papel-aplicacao.integracao.ts` (o PGlite não tem papéis).
 */
describe('Feature: readiness pela função de leitura das migrações (#889)', () => {
  afterEach(() => {
    vi.doUnmock('@/infrastructure/persistence/drizzle/db');
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('Dado o esquema migrado, Quando checa, Então a função devolve todas as migrações e está pronto', async () => {
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const { sql } = await import('drizzle-orm');
    const db = await getDb();
    const result = await db.execute(
      sql`select count(*)::int as n from public.app__drizzle_migrations()`,
    );
    const { rows } = result as unknown as { rows: { n: number }[] };
    expect(rows[0]?.n).toBeGreaterThan(0);

    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );
    expect((await checkReadiness()).ready).toBe(true);
  });

  it('Dado função ausente (42883, banco sem a 0080), Quando checa, Então pendente; permissão negada (42501) segue falha', async () => {
    vi.resetModules();
    const real = await vi.importActual<
      typeof import('@/infrastructure/persistence/drizzle/db')
    >('@/infrastructure/persistence/drizzle/db');
    let failure: unknown = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('function does not exist'), {
        code: '42883',
      }),
    });
    vi.doMock('@/infrastructure/persistence/drizzle/db', () => ({
      MIGRATIONS_FOLDER: real.MIGRATIONS_FOLDER,
      getDb: async () => ({
        execute: async (query: unknown) => {
          if (JSON.stringify(query).includes('app__drizzle_migrations')) {
            throw failure;
          }
          return { rows: [] };
        },
      }),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { checkReadiness } = await import(
      '@/infrastructure/persistence/drizzle/readiness'
    );

    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'ok',
      migrations: 'pending',
    });

    failure = Object.assign(new Error('permission denied'), { code: '42501' });
    expect(await checkReadiness()).toEqual({
      ready: false,
      database: 'fail',
      migrations: 'unknown',
    });
  });
});
