import { expect, type Page, test } from "@playwright/test";

/**
 * Fundação de tema (#425): o `<html>` nasce claro + violeta, a escolha
 * claro/escuro fica no aparelho e é aplicada antes da hidratação — com a CSP
 * estrita do build de produção (o script inline do tema precisa do nonce).
 */

const STORAGE_KEY = "estomasystech:modo";

function trackCspViolations(page: Page): () => string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return () => violations;
}

test.describe("Tema claro/escuro por aparelho (#425)", () => {
  test("Dado uma pessoa sem escolha, Quando abrir o login, Então o app é claro e violeta, sem violação de CSP", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const violations = trackCspViolations(page);

    await page.goto("/login");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
    expect(violations()).toEqual([]);
    await context.close();
  });

  test("Dado que a pessoa escolheu escuro, Quando recarregar, Então o app segue escuro", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Usar tema escuro" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Usar tema claro" }).first()).toBeAttached();
    const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(JSON.parse(saved ?? "{}")).toMatchObject({ mode: "dark", accent: "violet" });

    await page.getByRole("button", { name: "Usar tema claro" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
