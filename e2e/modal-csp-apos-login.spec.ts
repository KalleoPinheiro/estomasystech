import { test, expect } from "@playwright/test";
import { E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD } from "./support/constants";
import { nextTotpCode } from "./support/totp";

/**
 * #562 (achado da revisão): o login faz `router.push` + `router.refresh()`. A requisição RSC
 * nova traz outro nonce, mas a CSP vigente continua a do HTML de `/login`. O `<style>` do modal
 * aberto depois do login tem de usar o nonce do documento, não o do refresh.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("modal aberto depois do login (push + refresh) não viola a CSP e trava o fundo", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy: ${event.violatedDirective} bloqueou ${event.blockedURI || "inline"}`);
    });
  });

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(E2E_SUPER_ADMIN_EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(E2E_SUPER_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Código do autenticador", { exact: true }).fill(await nextTotpCode());
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL("/plataforma");

  await page.locator('a[href^="/plataforma/clinicas/"]:not([href$="/nova"])').first().click();
  await page.getByRole("button", { name: "Suspender clínica" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  expect(await page.locator("body").evaluate((el) => getComputedStyle(el).overflow)).toBe("hidden");
  expect(violations).toEqual([]);
});
