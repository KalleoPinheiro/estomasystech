import { defineConfig } from "vitest/config";
import type { TestUserConfig } from "vitest/node";

// Config do Stryker (npm run test:mutacao): mesma configuração da suíte, mas só
// com os testes de domínio e aplicação, que são os que exercitam os mutantes de
// src/domain e src/application. A suíte inteira (444 arquivos) estoura o tempo da
// rodada inicial do Stryker. Não altera nenhum limiar nem teste da suíte normal.
// `include` é substituído (mergeConfig concatenaria com o da suíte).
const { default: base } = (await import(
  new URL("./vitest.config.mts", import.meta.url).href
)) as { default: { test: TestUserConfig } };

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      "tests/domain/**/*.test.ts",
      "tests/application/**/*.test.ts",
      // ADR-084: src/lib/server (acesso e auditoria) entra na mutação do gate da nuvem.
      "tests/lib/server/**/*.test.ts",
      // Envelope e tradução de erro das ações e rotas (mutantes da revisão do #619).
      "tests/lib/action-result.test.ts",
      "tests/lib/api-response.test.ts",
    ],
    coverage: { enabled: false },
  },
});
