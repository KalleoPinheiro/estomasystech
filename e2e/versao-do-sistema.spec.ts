import { expect, test } from "@playwright/test";

/**
 * Versão do sistema no rodapé (#516, ADR-066): o que a barra lateral mostra é o que
 * `GET /api/version` devolve, em formato `v<versão>`; a equipe logada lê a rota, sem sessão é 401.
 */
test.describe("versão do sistema no rodapé", () => {
  test("a barra lateral mostra a versão que a API devolve", async ({ page }) => {
    await page.setViewportSize({ width: 1265, height: 802 });
    await page.goto("/agenda");

    const response = await page.request.get("/api/version");
    expect(response.ok()).toBe(true);
    const { data } = (await response.json()) as { data: { version: string } };
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);

    await expect(page.locator("aside [data-app-version]")).toContainText(`v${data.version}`);
  });

  test("sem sessão a rota responde 401", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    const response = await anon.get("/api/version");
    expect(response.status()).toBe(401);
    await anon.dispose();
  });
});
