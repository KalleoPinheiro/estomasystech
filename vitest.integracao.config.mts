import { defineConfig } from 'vitest/config';
import type { TestUserConfig } from 'vitest/node';

/**
 * Suíte de integração contra Postgres real (issue #404): `npm run test:integracao`.
 * Herda de `vitest.config.mts` (timeouts, env, aliases, setup do PGlite que `tests/setup.ts`
 * exige) e acrescenta o banco real. `include` é substituído, não somado: roda os testes que
 * passam por `getDb()` (rotas, seed) e os de `tests/integracao`; os de repositório que montam o
 * PGlite à mão ficam na suíte normal. Sem cobertura aqui: o limiar é da suíte normal.
 */
const { default: base } = (await import(new URL('./vitest.config.mts', import.meta.url).href)) as {
  default: { test: TestUserConfig };
};

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [...(base.test.globalSetup as string[]), 'tests/support/postgres-global-setup.ts'],
    setupFiles: [...(base.test.setupFiles as string[]), 'tests/support/postgres-setup.ts'],
    include: ['tests/api/**/*.test.ts', 'tests/integracao/**/*.integracao.ts', 'tests/scripts/seed.test.ts'],
    // Cada arquivo clona um banco: limita os workers para respeitar max_connections.
    maxWorkers: 4,
  },
});
