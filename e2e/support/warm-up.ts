import { chromium } from "@playwright/test";
import { ADMIN_STORAGE_STATE_PATH, MAIN_BASE_URL } from "./constants";

const WARM_UP_TIMEOUT_MS = 60_000;

/**
 * Compila sob demanda as telas que os specs de papel abrem antes do primeiro teste
 * (#308). Contra `next dev`, a primeira visita a uma rota espera a compilação, e em
 * máquina lenta isso passa dos 10 s da asserção (a tela ainda em esqueleto). A
 * compilação não depende do papel: a sessão do Admin serve.
 */
export async function warmUpRoutes(paths: readonly string[]): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      storageState: ADMIN_STORAGE_STATE_PATH,
      baseURL: MAIN_BASE_URL,
    });
    const page = await context.newPage();
    for (const path of paths) {
      await page.goto(path, { waitUntil: "load", timeout: WARM_UP_TIMEOUT_MS });
      await page
        .waitForLoadState("networkidle", { timeout: WARM_UP_TIMEOUT_MS })
        .catch(() => undefined);
    }
    await context.close();
  } finally {
    await browser.close();
  }
}
