import { afterAll, inject, vi } from 'vitest';
import { dropFileDb, getFileDb } from './postgres-integration';

/**
 * Setup por arquivo da suíte de integração (vitest.integracao.config.mts): troca o `getDb()`
 * (que os testes apontam para o PGlite via ESTOMASYSTECH_DB_DRIVER) por um banco clonado do
 * modelo no Postgres real. `getSystemDb()` aponta para o mesmo banco. Todo o resto do módulo `db.ts` segue o original.
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
    // Escopo de sistema (RLS etapa 2, ADR-110) usa `getSystemDb()`; na suíte é o mesmo banco do arquivo.
    getSystemDb: () =>
      getFileDb(
        inject('integrationDatabaseUrl'),
        inject('integrationTemplate'),
      ),
  };
});

afterAll(async () => {
  await dropFileDb(inject('integrationDatabaseUrl'));
});
