import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Spec de console limpo (#543) contra o `next dev`. Config à parte porque o contrato do
 * `test:e2e:dev` é rodar só papéis e login (#308, C46); o lado de produção já pega a spec pelo
 * `playwright.prod.config.ts`. Uso: `npm run test:console`.
 */
export default defineConfig({
  ...base,
  testMatch: ["console-limpo.spec.ts"],
});
