import { defineConfig } from "vitest/config";
import type { TestUserConfig } from "vitest/node";

// Config de UM shard da cobertura (ADR-087). O shard só roda a sua fatia e grava o blob do relatório
// (testes + cobertura bruta); o piso de cobertura NÃO é conferido aqui, porque uma fatia sozinha nunca
// atinge 100% nas camadas de regra. Os limiares de `vitest.config.mts` valem, sem alteração, no passo
// que junta os blobs (`vitest --merge-reports --coverage`, config da suíte inteira): falhar ali reprova
// o gate. Teste vermelho em qualquer fatia reprova o próprio shard.
const { default: base } = (await import(new URL("./vitest.config.mts", import.meta.url).href)) as {
  default: { test: TestUserConfig };
};

export default defineConfig({
  ...(base as object),
  test: {
    ...base.test,
    coverage: { ...base.test.coverage, thresholds: undefined },
  },
});
