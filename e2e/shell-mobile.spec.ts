import { expect, test } from "@playwright/test";

/**
 * Shell mobile (#428): barra inferior com atalhos por papel abaixo de `md`,
 * "Mais" como rota real, regras de iOS/Android (viewport-fit, campos >= 16px,
 * alvos de 44px). A sessão padrão do E2E é a de Admin da clínica.
 */

const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1280, height: 800 } as const;

test.describe("Shell mobile (#428)", () => {
  test("Dado o celular, Então a barra inferior fica colada no rodapé com alvos de 44px", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    const bar = page.getByRole("navigation", { name: "Atalhos" });
    await expect(bar).toBeVisible();
    for (const name of ["Hoje", "Agenda", "Pacientes", "Faturas", "Mais"]) {
      await expect(bar.getByRole("link", { name })).toBeVisible();
    }
    await expect(bar.getByRole("link", { name: "Hoje" })).toHaveAttribute("aria-current", "page");

    const box = await bar.boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(MOBILE.height, 0);
    for (const link of await bar.getByRole("link").all()) {
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("Dado o celular, Quando tocar em Mais, Então abre a lista do resto e o voltar do navegador volta", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    await page.getByRole("navigation", { name: "Atalhos" }).getByRole("link", { name: "Mais" }).click();
    await expect(page).toHaveURL(/\/mais$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Auditoria" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Minha conta" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });

  test("Dado o desktop, Então não há barra inferior (o menu lateral cuida)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Atalhos" })).toBeHidden();
  });

  test("Dado o celular, Então o viewport cobre a tela toda, sem travar o zoom, e os campos têm 16px ou mais", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: MOBILE,
    });
    const page = await context.newPage();
    await page.goto("/login");

    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("viewport-fit=cover");
    expect(viewport).not.toMatch(/maximum-scale|user-scalable/);

    const fontSize = await page
      .getByLabel("Email", { exact: true })
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    await context.close();
  });
});
