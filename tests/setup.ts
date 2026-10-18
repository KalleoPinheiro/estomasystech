import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, inject, vi } from 'vitest';

/**
 * Sem `test.globals: true`, o auto-cleanup do @testing-library/react entre
 * testes não se registra sozinho — DOM de um `it` vaza pro próximo no mesmo
 * arquivo (ambiguidade em getByText etc). Guardado por `document` para não
 * quebrar os arquivos com `environment: "node"` (maioria da suíte).
 */
afterEach(() => {
  if (typeof document !== 'undefined') {
    cleanup();
  }
});

/**
 * `after()` do Next.js exige um request scope real (AsyncLocalStorage) que não
 * existe ao chamar route handlers diretamente em teste — lança
 * "`after` was called outside a request scope". Substituímos por execução
 * imediata (fire-and-forget), preservando todo o resto do módulo real.
 */
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (task: () => void | Promise<void>) => {
      void task();
    },
  };
});

/**
 * `getDb()` (src/infrastructure/persistence/drizzle/db.ts) migra o PGlite do
 * zero quando `ESTOMASYSTECH_DB_DRIVER=pglite`. Repassamos o caminho do snapshot já
 * migrado (tests/support/pglite-global-setup.ts, 1x pra toda a suíte) — ao
 * encontrar essa env var, `createPgliteDb()` carrega o snapshot em vez de
 * rodar `migrate()` de novo (#111). Cada arquivo ainda ganha sua própria
 * instância PGlite (mesmo isolamento de sempre), só que restaurada de um
 * dump binário, não remontada via SQL.
 *
 * Setado incondicionalmente (não só quando `ESTOMASYSTECH_DB_DRIVER === 'pglite'`):
 * arquivos de teste setam essa env var no topo do próprio módulo, que só
 * executa DEPOIS de `setupFiles` — checar a env var aqui sempre veria o
 * valor antigo (ou nenhum). Arquivos que não usam PGlite simplesmente nunca
 * leem `ESTOMASYSTECH_PGLITE_TEMPLATE_PATH`.
 */
process.env.ESTOMASYSTECH_PGLITE_TEMPLATE_PATH = inject('pgliteTemplatePath');
