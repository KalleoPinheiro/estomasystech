import { type BrowserContext, expect, test } from "@playwright/test";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #545, casca da equipe no servidor (ADR-075): o papel sem acesso a uma tela recebe «Acesso negado»
 * já no HTML, sem a página montar nem chamar a API de dados; o papel com acesso entra direto. A casca
 * (menu, identidade, versão) não chama `/api` na carga de nenhuma tela da equipe.
 */
async function signIn(context: BrowserContext, role: UserRole) {
  await context.addCookies([sessionCookie(`casca-${role}@estomasystech.test`, role)]);
}

function trackApiCalls(page: import("@playwright/test").Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const type = request.resourceType();
    const { pathname } = new URL(request.url());
    if ((type === "fetch" || type === "xhr") && pathname.startsWith("/api/")) calls.push(pathname);
  });
  return calls;
}

test.describe("papel por tela no servidor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of [360, 1280]) {
    test(`em ${width}px o atendente em Faturamento recebe acesso negado sem chamar a API`, async ({ page }) => {
      await signIn(page.context(), "atendente");
      await page.setViewportSize({ width, height: 800 });
      const calls = trackApiCalls(page);

      await page.goto("/faturamento");

      await expect(page.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
      await expect(page.getByText("Seu papel não tem acesso a esta tela.")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(calls, "chamadas /api").toEqual([]);
    });
  }

  test("o admin da clínica abre Faturamento normalmente", async ({ page }) => {
    await signIn(page.context(), "company_admin");

    await page.goto("/faturamento");

    await expect(page.getByRole("heading", { name: "Faturamento", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acesso negado" })).toHaveCount(0);
  });

  test("a casca da Agenda não chama /api para identidade nem versão", async ({ page }) => {
    await signIn(page.context(), "atendente");
    const calls = trackApiCalls(page);

    await page.goto("/agenda");
    await page.waitForLoadState("networkidle");

    expect(calls.filter((path) => path === "/api/auth/identity" || path === "/api/version")).toEqual([]);
  });
});
