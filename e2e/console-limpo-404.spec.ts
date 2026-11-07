import { expect, test } from "@playwright/test";
import { sessionCookie } from "./support/session-token";

/**
 * #656: rota inexistente com console limpo. A 404 padrão do Next traz um `<style>` inline sem
 * nonce e viola a CSP (`style-src-elem`). Spec à parte do `console-limpo.spec.ts` (regra 8:
 * caso novo em vez de alterar o existente). Roda com sessão assinada (deslogado o proxy manda para `/login`), no build de produção (CSP estrita).
 */
const ROUTE = "/rota-que-nao-existe";
const WIDTHS = [360, 390, 768, 1280];

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of WIDTHS) {
  test(`rota inexistente em ${width}px mostra a 404 acolhedora sem erro de CSP no console`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      // O próprio navegador registra o 404 do documento («Failed to load resource»): é o status esperado, não a CSP.
      const isExpected404 = message.text().startsWith("Failed to load resource") && message.location().url.endsWith(ROUTE);
      if ((message.type() === "error" || message.type() === "warning") && !isExpected404) problems.push(`${message.text()} (${message.location().url})`);
    });
    page.on("pageerror", (error) => problems.push(error.message));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`Content Security Policy: ${event.violatedDirective} bloqueou ${event.blockedURI || "inline"}`);
      });
    });
    await page.context().addCookies([sessionCookie("console-limpo-404@estomasystech.test", "company_admin")]);
    await page.setViewportSize({ width, height: 800 });

    const response = await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar ao início" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(problems, "console sujo na 404").toEqual([]);
  });
}
