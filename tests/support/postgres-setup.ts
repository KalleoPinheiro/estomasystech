import { afterAll, inject, vi } from 'vitest';
import { dropFileDb, getFileDb } from './postgres-integration';

/**
 * Setup por arquivo da suíte de integração (vitest.integracao.config.mts): troca o `getDb()`
 * (que os testes apontam para o PGlite via ESTOMASYSTECH_DB_DRIVER) por um banco clonado do
 * modelo no Postgres real. Todo o resto do módulo `db.ts` segue o original.
 */
vi.mock('@/infrastructure/persistence/drizzle/db', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/infrastructure/persistence/drizzle/db')
    >();
  return {
    ...actual,
    getDb: () =>
      getFileDb(
        inject('integrationDatabaseUrl'),
        inject('integrationTemplate'),
      ),
  };
});

afterAll(async () => {
  await dropFileDb(inject('integrationDatabaseUrl'));
});
