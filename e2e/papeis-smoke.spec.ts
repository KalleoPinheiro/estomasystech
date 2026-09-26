import { test, expect, type Page } from "@playwright/test";
import { type E2EStaffRole, ROLE_ACCOUNTS } from "./support/constants";
import { type ApiFailure, dangerAlerts, roleStorageState, trackApiFailures } from "./support/roles";

/**
 * Smoke por papel (#204): com a sessão real de cada papel, percorre cada item
 * visível do menu e falha em qualquer 4xx/5xx de `/api/*` ou alerta de erro na
 * página. Foi a falta disso que deixou os 403 da #188/#189 passarem com a
 * suíte inteira verde (ela só rodava como Super Admin).
 *
 * Menu e dashboard seguem o papel (#199): o Atendente e o Profissional só
 * veem telas e cartões que a política libera, então nenhuma tela do menu pode
 * responder erro — não há lacuna tolerada.
 */
const TEST_NAMES: Record<E2EStaffRole, string> = {
  company_admin: "company_admin percorre o menu sem erro",
  atendente: "atendente percorre o menu do papel sem erro",
  profissional: "profissional percorre o menu do papel sem erro",
};

async function visibleMenu(page: Page): Promise<string[]> {
  await page.goto("/");
  const nav = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Agenda" }) });
  await expect(nav.getByRole("link", { name: "Agenda" })).toBeVisible();
  const hrefs = await nav.getByRole("link").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );
  return [...new Set(hrefs.filter((href) => href.startsWith("/")))];
}

interface PageReport {
  href: string;
  failures: ApiFailure[];
  alerts: string[];
}

async function visit(page: Page, href: string, tracker: ReturnType<typeof trackApiFailures>): Promise<PageReport> {
  tracker.reset();
  await page.goto(href);
  await page.waitForLoadState("networkidle");
  return { href, failures: tracker.list(), alerts: await dangerAlerts(page) };
}

for (const role of Object.keys(ROLE_ACCOUNTS) as E2EStaffRole[]) {
  test.describe(`smoke por papel: ${role}`, () => {
    test.use({ storageState: roleStorageState(role), viewport: { width: 1280, height: 800 } });

    test(TEST_NAMES[role], async ({ page }) => {
      const tracker = trackApiFailures(page);
      const menu = await visibleMenu(page);
      expect(menu.length).toBeGreaterThan(0);

      for (const href of menu) {
        const report = await visit(page, href, tracker);
        expect.soft(report.failures, `${href}: respostas de erro em /api/*`).toEqual([]);
        expect.soft(report.alerts, `${href}: alerta de erro na página`).toEqual([]);
      }
    });

    test(`sessão de ${role} vem do login real`, async ({ page }) => {
      const response = await page.request.get("/api/auth/identity");
      const body = (await response.json()) as {
        data: { account: { email: string; role: string } | null };
      };

      expect(response.status()).toBe(200);
      expect(body.data.account).toMatchObject({ email: ROLE_ACCOUNTS[role].email, role });
    });
  });
}
