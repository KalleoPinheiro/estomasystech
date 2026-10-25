import { expect, test } from "@playwright/test";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #548, tela Hoje no servidor (ADR-069): a carga não chama `/api` (os blocos vêm no HTML, cada um
 * com o próprio Suspense), a página não salta (CLS ≤ 0,1) e cada papel vê só os blocos que usa.
 */
const CLS_LIMIT = 0.1;

for (const role of ["company_admin", "atendente"] as const) {
  test.describe(`Hoje no servidor: ${role}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const width of [360, 390, 768, 1280]) {
      test(`em ${width}px a carga não chama /api, mostra os blocos do papel e não salta`, async ({ page }) => {
        await page.context().addCookies([sessionCookie(`hoje-${role}@estomasystech.test`, role as UserRole)]);
        await page.setViewportSize({ width, height: 800 });
        const apiCalls: string[] = [];
        page.on("request", (request) => {
          const type = request.resourceType();
          if ((type === "fetch" || type === "xhr") && new URL(request.url()).pathname.startsWith("/api/")) {
            apiCalls.push(`${request.method()} ${new URL(request.url()).pathname}`);
          }
        });
        await page.addInitScript(() => {
          const box = { cls: 0 };
          (window as unknown as { __cls: typeof box }).__cls = box;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
              if (!shift.hadRecentInput) box.cls += shift.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
        });

        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1, name: "Hoje" })).toBeVisible();
        await expect(page.getByText("Consultas de hoje")).toBeVisible();
        await page.waitForLoadState("networkidle");

        expect(apiCalls, "chamadas /api na carga").toEqual([]);
        const resumo = page.getByText("Recebido no mês");
        if (role === "company_admin") {
          await expect(resumo).toBeVisible();
        } else {
          await expect(resumo).toHaveCount(0);
        }
        const cls = await page.evaluate(() => (window as unknown as { __cls: { cls: number } }).__cls.cls);
        expect(cls, "CLS da Hoje").toBeLessThanOrEqual(CLS_LIMIT);
      });
    }
  });
}
