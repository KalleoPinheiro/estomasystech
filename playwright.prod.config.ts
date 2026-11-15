import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import {
  E2E_AUTH_SECRET,
  E2E_BOOTSTRAP_TOKEN,
  E2E_BLIND_INDEX_PEPPER,
  E2E_DATA_ENCRYPTION_KEY,
  MAIN_BASE_URL,
  ROLE_ACCOUNT_SPECS,
} from "./e2e/support/constants";

/**
 * Suíte E2E contra o build de produção (issues #203 e #308): `next start` sobre
 * um `npm run build` já feito, com NODE_ENV=production — CSP estrita (sem
 * 'unsafe-eval'/'unsafe-inline'), cookie `Secure`, e-mail obrigatório. É o gate
 * principal do E2E: sem compilação sob demanda nem Fast Refresh, é determinística
 * e igual ao artefato que vai para produção. Fica de fora `ROLE_ACCOUNT_SPECS`, que precisa do convite no log do
 * servidor em desenvolvimento e rodam em `playwright.config.ts`.
 *
 * Uso: `npm run build && npx playwright test -c playwright.prod.config.ts`.
 */
export default defineConfig({
  ...base,
  // Sem as contas por papel (#204): o convite delas só sai no log sem e-mail.
  globalSetup: "./e2e/global-setup.prod.ts",
  testMatch: /.*\.spec\.ts/,
  testIgnore: [...ROLE_ACCOUNT_SPECS],
  // Build de produção não compila rota sob demanda: sem retry para mascarar.
  retries: 0,
  webServer: [
    {
      command: "npm run start",
      url: MAIN_BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ESTOMASYSTECH_DB_DRIVER: "pglite",
        // Gancho de teste: deixa o E2E fazer uma leitura do servidor falhar (src/lib/server/test-faults.ts).
        ESTOMASYSTECH_E2E_FAULTS: "1",
        TZ: "America/Sao_Paulo",
        APP_TIMEZONE: "America/Sao_Paulo",
        AUTH_SECRET: E2E_AUTH_SECRET,
        // Produção exige a chave do dado clínico (#195, ADR-006).
        DATA_ENCRYPTION_KEY: E2E_DATA_ENCRYPTION_KEY,
        // Produção exige o pepper do índice cego (#734, ADR-096).
        BLIND_INDEX_PEPPER: E2E_BLIND_INDEX_PEPPER,
        ESTOMASYSTECH_BOOTSTRAP_TOKEN: E2E_BOOTSTRAP_TOKEN,
        APP_URL: MAIN_BASE_URL,
        API_RATE_LIMIT_MAX: "100000",
        // Exercita o gateway Resend da plataforma (opcional, ADR-011). Chave de
        // mentira: o envio falha (401) e o bootstrap devolve o link do convite
        // na resposta, como já faz quando a entrega não acontece.
        RESEND_API_KEY: "re_e2e_invalid_key",
        EMAIL_FROM: "EstomaSysTech E2E <e2e@estomasystech.test>",
      },
    },
  ],
});
