import { expect, test } from "@playwright/test";
import { createInvoice, createPatient, unique } from "./support/api";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #547, Faturamento e Repasses no servidor (ADR-069): a carga não chama `/api` (faturas, totais e
 * extrato vêm no HTML) e a página não salta nas quatro larguras (CLS < 0,05).
 */
const CLS_LIMIT = 0.05;

const pages = [
  { path: "/faturamento", heading: "Faturamento", role: "company_admin" },
  { path: "/repasses", heading: "Repasses", role: "company_admin" },
] as const;

test.describe("Faturamento e Repasses no servidor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([sessionCookie("local", "company_admin")]);
    const request = context.request;
    for (let i = 0; i < 3; i++) {
      const patient = await createPatient(request, { fullName: `Zz Fatura CLS ${unique()}` });
      await createInvoice(request, {
        patientId: patient.id,
        description: `Fatura CLS ${unique()}`,
        amountCents: 12_345 + i,
      });
    }
    await context.close();
  });

  for (const { path, heading, role } of pages) {
    for (const width of [360, 390, 768, 1280]) {
      test(`${path} em ${width}px: a carga não chama /api e não salta`, async ({ page }) => {
        await page.context().addCookies([sessionCookie("local", role as UserRole)]);
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

        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        if (path === "/faturamento") {
          await expect(page.getByText("Total a receber")).toBeVisible();
          await expect(page.getByText("Fatura CLS").first()).toBeVisible();
        }
        await page.waitForLoadState("networkidle");

        expect(apiCalls, "chamadas /api na carga").toEqual([]);
        const cls = await page.evaluate(() => (window as unknown as { __cls: { cls: number } }).__cls.cls);
        expect(cls, `CLS de ${path}`).toBeLessThan(CLS_LIMIT);
      });
    }
  }
});
