import { expect, test } from "@playwright/test";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #544, fundação server first (ADR-069): `/mais` é Server Component. A carga não chama `/api`
 * (identidade, versão e a lista de telas já vêm no HTML), a página não salta (CLS ≤ 0,1) e o
 * `POST` de Server Action passa pelo limite de requisições do proxy.
 */
const CLS_LIMIT = 0.1;

async function signIn(context: import("@playwright/test").BrowserContext, subject: string, role: UserRole) {
  await context.addCookies([sessionCookie(subject, role)]);
}

for (const role of ["company_admin", "atendente"] as const) {
  test.describe(`/mais no servidor: ${role}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const width of [360, 1280]) {
      test(`em ${width}px a carga não chama /api, lista as telas do papel e não salta`, async ({ page }) => {
        await signIn(page.context(), `server-first-${role}@estomasystech.test`, role);
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

        await page.goto("/mais");
        await expect(page.getByRole("heading", { level: 1, name: "Mais" })).toBeVisible();
        // Escopo na lista da página: no desktop o menu lateral repete os mesmos links.
        const lista = page.locator("section[aria-labelledby^='mais-']");
        await expect(lista.getByRole("link", { name: "Minha conta" })).toBeVisible();
        await page.waitForLoadState("networkidle");

        expect(apiCalls, "chamadas /api na carga").toEqual([]);
        const auditoria = lista.getByRole("link", { name: "Auditoria" });
        if (role === "company_admin") {
          await expect(auditoria).toBeVisible();
        } else {
          await expect(auditoria).toHaveCount(0);
        }
        const cls = await page.evaluate(() => (window as unknown as { __cls: { cls: number } }).__cls.cls);
        expect(cls, "CLS de /mais").toBeLessThanOrEqual(CLS_LIMIT);
      });
    }
  });
}

test.describe("guarda de sessão das páginas no servidor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("sem sessão, /mais vai ao login com a volta em next", async ({ page }) => {
    await page.goto("/mais");

    await expect(page).toHaveURL(/\/login\?next=%2Fmais$/);
  });

  test("papel do portal numa página da equipe não vê a tela", async ({ page }) => {
    await signIn(page.context(), "server-first-portal@estomasystech.test", "patient");

    await page.goto("/mais");

    await expect(page).toHaveURL(/\/portal/);
  });
});

test.describe("limite de requisições da Server Action (ADR-069 § 2)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("o POST com Next-Action acima do teto por minuto recebe 429", async ({ page }) => {
    await signIn(page.context(), "server-first-limite@estomasystech.test", "atendente");
    const post = () =>
      page.context().request.post("/mais", {
        headers: { "next-action": "00".repeat(20), "content-type": "text/plain;charset=UTF-8" },
        data: "[]",
        failOnStatusCode: false,
      });

    const statuses: number[] = [];
    for (let i = 0; i < 125; i += 1) {
      statuses.push((await post()).status());
    }

    expect(statuses.slice(0, 120).every((status) => status !== 429)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
