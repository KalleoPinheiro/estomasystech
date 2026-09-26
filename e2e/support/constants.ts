import { randomBytes } from "node:crypto";

/**
 * Constantes compartilhadas entre `playwright.config.ts`, `global-setup.ts` e os specs.
 *
 * O app exige AUTH_SECRET configurado para qualquer sessão funcionar — inclusive o
 * portal do paciente/parceiro, que chama `getRequestSession()` diretamente (não só o
 * proxy). Por isso a suíte roda com autenticação SEMPRE ligada no servidor principal
 * (porta 3000).
 *
 * Desde a remoção da senha mestre (issue #21 / ADR-004) o único caminho de login é
 * e-mail + senha da própria conta, então o `global-setup` primeiro faz o bootstrap do
 * Super Admin (`POST /api/auth/bootstrap`, autenticado por `VITTA_BOOTSTRAP_TOKEN`),
 * consome o convite que chega no dry-run do gateway de e-mail e só então loga. Os
 * specs de portal seguem assinando um cookie de sessão manualmente (mesma assinatura
 * HMAC de `src/lib/auth/session.ts`), já que a suíte não semeia contas de
 * paciente/parceiro.
 *
 * Um segundo servidor (porta 3100), sem AUTH_SECRET, sobe em paralelo só para o
 * cenário de "modo aberto" em `auth.spec.ts` — ele tem seu próprio banco PGlite
 * isolado (cada processo Next tem sua própria instância em memória), então só serve
 * para checar navegação sem login, nunca para dados semeados.
 */
export const MAIN_BASE_URL = "http://localhost:3000";
export const MAIN_PORT = 3000;

export const OPEN_MODE_BASE_URL = "http://localhost:3100";
export const OPEN_MODE_PORT = 3100;

/**
 * Credenciais da suíte E2E. Nunca são credenciais de produção.
 *
 * Não ficam no código-fonte (GitLeaks `generic-api-key` / Semgrep
 * `hardcoded_secrets`): por padrão são geradas por execução e gravadas de volta em
 * `process.env`. Este módulo é carregado primeiro pelo runner do Playwright (via
 * `playwright.config.ts`); os workers são processos filhos e herdam esse `env`, e o
 * servidor que o próprio Playwright sobe recebe os valores por `webServer.env`
 * (mapeados para `AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN`).
 *
 * O alcance para aí: a propagação cobre apenas processos gerenciados pelo Playwright.
 * Um `npm run dev` iniciado à parte lê o ambiente dele, e `webServer.env` não é
 * aplicado quando `reuseExistingServer` reaproveita esse processo. Para reaproveitar
 * um servidor já em pé é preciso que os pares batam: exporte
 * `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` para a suíte e
 * `AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN` com os mesmos valores para o servidor.
 */
const secretFromEnv = (name: string, bytes: number): string => {
  const current = process.env[name];
  if (current !== undefined && current.length > 0) {
    return current;
  }
  const generated = randomBytes(bytes).toString("base64url");
  process.env[name] = generated;
  return generated;
};

export const E2E_AUTH_SECRET = secretFromEnv("E2E_AUTH_SECRET", 32);
/** Segredo de deploy que libera `POST /api/auth/bootstrap` na instalação limpa da suíte. */
export const E2E_BOOTSTRAP_TOKEN = secretFromEnv("E2E_BOOTSTRAP_TOKEN", 18);

/** Conta Super Admin criada pelo bootstrap e usada pelos specs de equipe. */
export const E2E_ADMIN_EMAIL = "e2e-super-admin@vitta.test";
/** Senha definida pelo próprio fluxo de convite — não é senha mestre de ninguém. */
export const E2E_ADMIN_PASSWORD = secretFromEnv("E2E_ADMIN_PASSWORD", 18);

export const ADMIN_STORAGE_STATE_PATH = "e2e/.auth/admin-storage.json";

/**
 * Log do servidor principal (`playwright.config.ts` grava via `tee`). Sem canal de
 * e-mail configurado, o `NullEmailGateway` imprime o convite ali — é por onde o
 * `global-setup` alcança o link das contas por papel, como faria quem lê o e-mail.
 */
export const MAIN_SERVER_LOG_PATH = "e2e/.auth/main-server.log";

/** Senha que cada conta por papel define no próprio convite (gerada por execução). */
export const E2E_ROLE_PASSWORD = secretFromEnv("E2E_ROLE_PASSWORD", 18);

/** Papéis de equipe com conta própria na suíte (#204); o Super Admin segue acima. */
export const E2E_STAFF_ROLES = ["company_admin", "atendente", "profissional"] as const;
export type E2EStaffRole = (typeof E2E_STAFF_ROLES)[number];

/** Conta de cada papel: criada por `POST /api/accounts` + convite + login no `global-setup`. */
export const ROLE_ACCOUNTS: Record<E2EStaffRole, { email: string; storageState: string }> = {
  company_admin: {
    email: "e2e-company-admin@vitta.test",
    storageState: "e2e/.auth/company_admin-storage.json",
  },
  atendente: {
    email: "e2e-atendente@vitta.test",
    storageState: "e2e/.auth/atendente-storage.json",
  },
  profissional: {
    email: "e2e-profissional@vitta.test",
    storageState: "e2e/.auth/profissional-storage.json",
  },
};

/** Espelha `LEGACY_CLINIC_ID` — a empresa onde o `global-setup` semeia tudo. */
export const E2E_CLINIC_ID = "legacy-clinic";
export const SEED_DATA_PATH = "e2e/support/seed-data.json";

/** Mesmo nome de cookie de `src/lib/auth/session.ts` (SESSION_COOKIE). */
export const SESSION_COOKIE_NAME = "vitta_session";

/**
 * Espelha `DEFAULT_SCHEDULE_CONFIG` de `src/domain/scheduling/schedule-config.ts`.
 * `configuracoes.spec.ts` restaura este valor depois de testar grades customizadas,
 * já que o banco PGlite do servidor principal é compartilhado por toda a suíte.
 */
export const DEFAULT_SCHEDULE_CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
};
