import { test, expect, type Page } from "@playwright/test";

/**
 * #562: o `<style>` de bloqueio de rolagem (react-remove-scroll) tem de levar o nonce
 * da requisição; sem ele a CSP estrita de produção o bloqueia ao abrir modal ou folha.
 * Em `next dev` a CSP aceita 'unsafe-inline', então a garantia vale no build de produção.
 */
async function collectCspViolations(page: Page) {
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
  return violations;
}

for (const width of [360, 1280]) {
  test(`abrir e fechar modal em ${width}px não viola a CSP e trava a rolagem do fundo (#562)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const violations = await collectCspViolations(page);

    await page.goto("/procedimentos");
    await page.getByRole("button", { name: "+ Novo procedimento" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked", /.+/);
    expect(await page.locator("body").evaluate((el) => getComputedStyle(el).overflow)).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked", /.+/);

    expect(violations).toEqual([]);
  });
}
