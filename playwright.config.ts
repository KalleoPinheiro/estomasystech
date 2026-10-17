import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  ADMIN_STORAGE_STATE_PATH,
  E2E_AUTH_SECRET,
  E2E_BOOTSTRAP_TOKEN,
  MAIN_BASE_URL,
  MAIN_SERVER_LOG_PATH,
  ROLE_ACCOUNT_SPECS,
} from "./e2e/support/constants";

/**
 * O app exige AUTH_SECRET configurado para QUALQUER sessão funcionar — inclusive o
 * portal do paciente/parceiro (`getRequestSession()` não depende só do proxy, ver
 * `src/lib/auth/request-session.ts`). Por isso o servidor principal (porta 3000)
 * roda sempre com autenticação ligada: specs de equipe reaproveitam uma sessão
 * do Admin de Empresa da `legacy-clinic` já logada via `storageState` (criada em
 * `global-setup.ts`: bootstrap do Super Admin, convite do Admin pela plataforma,
 * senha e login reais); specs de papel (`papeis-*.spec.ts`)
 * trocam para o `storageState` de `company_admin`, `atendente` ou `profissional`,
 * também criados pelo convite + login real (#204); specs de portal assinam um cookie de
 * sessão paciente/parceiro na hora (mesmo segredo); `auth.spec.ts` testa o fluxo de
 * login de verdade.
 */
export default defineConfig({
  testDir: "./e2e",
  // Contra o `next dev` rodam só o que exige o servidor em desenvolvimento: as
  // contas por papel (convite no log, #204) e o login de `auth.spec.ts`. O
  // dev compila rota sob demanda e refaz o Fast Refresh no meio do teste, o que
  // deixava a suíte inteira intermitente (#308); o resto roda em
  // `playwright.prod.config.ts`, contra `next start`.
  testMatch: [...ROLE_ACCOUNT_SPECS, "auth.spec.ts"],
  // Banco PGlite em memória é compartilhado por todo o processo do servidor
  // principal — rodar specs em paralelo geraria corrida em agenda/estoque/etc.
  fullyParallel: false,
  workers: 1,
  // Servidor dev compila rotas sob demanda — a primeira visita de cada rota
  // no processo pode ser lenta o bastante pra estourar o timeout da assertion;
  // 1 retry absorve esse cold-compile sem mascarar falhas reais (que persistem).
  retries: 1,
  // `list` sozinho não deixa evidência (#308): o html gera `playwright-report/` e,
  // no CI, `github` transforma o teste falho em annotation do check.
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // Servidor dev (Turbopack) compila rotas sob demanda na primeira visita —
  // o default de 5s para assertions é apertado demais para isso.
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: MAIN_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: ADMIN_STORAGE_STATE_PATH,
    // O servidor roda com TZ=America/Sao_Paulo (ver webServer.env abaixo) e telas
    // como o formulário de remarcar constroem `new Date("YYYY-MM-DDTHH:mm:ss")`
    // sem offset (interpretado no fuso do BROWSER) — sem isso, o fuso do host que
    // roda os testes (não necessariamente São Paulo) desalinha os horários.
    timezoneId: "America/Sao_Paulo",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // `tee` grava o log que o global-setup lê para achar o convite das contas
      // por papel (#204): sem e-mail configurado, o NullEmailGateway imprime o
      // link ali. Ver MAIN_SERVER_LOG_PATH em e2e/support/constants.ts.
      command: `mkdir -p ${path.dirname(MAIN_SERVER_LOG_PATH)} && npm run dev 2>&1 | tee ${MAIN_SERVER_LOG_PATH}`,
      url: MAIN_BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITTA_DB_DRIVER: "pglite",
        TZ: "America/Sao_Paulo",
        AUTH_SECRET: E2E_AUTH_SECRET,
        // Libera POST /api/auth/bootstrap, o caminho que o global-setup usa
        // para criar o Super Admin da instalação limpa da suíte.
        VITTA_BOOTSTRAP_TOKEN: E2E_BOOTSTRAP_TOKEN,
        APP_URL: MAIN_BASE_URL,
        // A suíte inteira roda no mesmo IP (loopback) contra um processo só —
        // o limite de produção (120/min) estoura fácil com o volume de setup via API.
        API_RATE_LIMIT_MAX: "100000",
      },
    },
  ],
});
