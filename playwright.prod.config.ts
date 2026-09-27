import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import {
  E2E_AUTH_SECRET,
  E2E_BOOTSTRAP_TOKEN,
  E2E_DATA_ENCRYPTION_KEY,
  MAIN_BASE_URL,
} from "./e2e/support/constants";

/**
 * Subconjunto do E2E contra o build de produção (issue #203): `next start`
 * sobre um `npm run build` já feito, com NODE_ENV=production — CSP estrita
 * (sem 'unsafe-eval'/'unsafe-inline'), cookie `Secure`, e-mail obrigatório.
 * Cobre login, agenda, prontuário e portal, mais o spec que falha em qualquer
 * violação de CSP. O modo aberto fica de fora: é só de desenvolvimento.
 *
 * Uso: `npm run build && npx playwright test -c playwright.prod.config.ts`.
 */
export default defineConfig({
  ...base,
  // Sem as contas por papel (#204): o convite delas só sai no log sem e-mail.
  globalSetup: "./e2e/global-setup.prod.ts",
  testMatch: [
    "csp-producao.spec.ts",
    "auth.spec.ts",
    "agenda.spec.ts",
    "pacientes.spec.ts",
    "portal-paciente.spec.ts",
    "plataforma.spec.ts",
  ],
  grepInvert: /modo aberto/,
  // Build de produção não compila rota sob demanda: sem retry para mascarar.
  retries: 0,
  webServer: [
    {
      command: "npm run start",
      url: MAIN_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITTA_DB_DRIVER: "pglite",
        TZ: "America/Sao_Paulo",
        APP_TIMEZONE: "America/Sao_Paulo",
        AUTH_SECRET: E2E_AUTH_SECRET,
        // Produção exige a chave do dado clínico (#195, ADR-006).
        DATA_ENCRYPTION_KEY: E2E_DATA_ENCRYPTION_KEY,
        VITTA_BOOTSTRAP_TOKEN: E2E_BOOTSTRAP_TOKEN,
        APP_URL: MAIN_BASE_URL,
        API_RATE_LIMIT_MAX: "100000",
        // Produção exige canal de e-mail na subida. Chave de mentira: o envio
        // falha (401) e o bootstrap devolve o link do convite na resposta,
        // como já faz quando a entrega não acontece.
        RESEND_API_KEY: "re_e2e_invalid_key",
        EMAIL_FROM: "VittaFlow E2E <e2e@vitta.test>",
      },
    },
  ],
});
