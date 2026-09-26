import { type APIRequestContext, type Page, request as playwrightRequest } from "@playwright/test";
import { ADMIN_STORAGE_STATE_PATH, type E2EStaffRole, MAIN_BASE_URL, ROLE_ACCOUNTS } from "./constants";

/**
 * Fixtures por papel (#204). Um spec de papel troca a sessão com
 * `test.use({ storageState: roleStorageState("atendente") })` — o `storageState`
 * vem do login real feito no `global-setup`, não de cookie assinado à mão.
 */
export const roleStorageState = (role: E2EStaffRole): string => ROLE_ACCOUNTS[role].storageState;

/**
 * Contexto de API do Super Admin para preparar estado que o papel testado não
 * pode criar (ex.: condição clínica, quando o spec é do Atendente). Quem chama
 * descarta com `dispose()`.
 */
export const adminApi = (): Promise<APIRequestContext> =>
  playwrightRequest.newContext({ baseURL: MAIN_BASE_URL, storageState: ADMIN_STORAGE_STATE_PATH });

export interface ApiFailure {
  status: number;
  method: string;
  path: string;
}

/**
 * Registra toda resposta 4xx/5xx de `/api/*` vista pela página — o smoke por
 * papel e os fluxos de papel falham nelas em vez de deixar a tela "sumir com o
 * campo" em silêncio, que foi como os 403 da #188/#189 passaram.
 */
export function trackApiFailures(page: Page): { list: () => ApiFailure[]; reset: () => void } {
  let failures: ApiFailure[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/") || response.status() < 400) return;
    failures.push({
      status: response.status(),
      method: response.request().method(),
      path: `${url.pathname}${url.search}`,
    });
  });
  return {
    list: () => [...failures],
    reset: () => {
      failures = [];
    },
  };
}

/** Textos dos alertas de erro (`ErrorAlert`, variante danger) visíveis na página. */
export const dangerAlerts = (page: Page): Promise<string[]> =>
  page.locator(".sv-alert--danger").allInnerTexts();
