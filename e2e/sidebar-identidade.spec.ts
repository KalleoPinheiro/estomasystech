import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Bloco da clínica e do usuário na barra lateral (desktop): avatar inteiro, uma
 * linha por texto e sem violação séria de acessibilidade (WCAG 2.2 AA).
 */
test.use({ viewport: { width: 1280, height: 800 } });

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("barra lateral: bloco da clínica e do usuário", () => {
  test("avatar e logo ficam inteiros e os textos ficam em uma linha", async ({ page }) => {
    await page.goto("/");
    const email = page.locator("[data-sidebar-email]");
    await expect(email).toBeVisible();

    const emailBox = await email.boundingBox();
    expect(emailBox!.height).toBeLessThan(24);

    const iniciais = page.locator("aside span.inline-flex.shrink-0");
    expect(await iniciais.count()).toBeGreaterThanOrEqual(2);
    for (const box of await iniciais.all()) {
      const rect = await box.boundingBox();
      expect(rect!.width).toBeCloseTo(32, 0);
      expect(rect!.height).toBeCloseTo(32, 0);
    }
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`barra lateral (${esquema}) não tem violação séria ou crítica`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await page.addInitScript((mode) => {
        localStorage.setItem("estomasystech:modo", JSON.stringify({ mode, accent: "violet" }));
      }, esquema);
      await page.goto("/");
      await expect(page.locator("[data-sidebar-email]")).toBeVisible();
      await page.waitForLoadState("networkidle");

      const resultado = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const graves = resultado.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(graves.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  }
});
