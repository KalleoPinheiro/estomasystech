import { test, expect, type Page } from "@playwright/test";
import { type E2EStaffRole, ROLE_ACCOUNTS } from "./support/constants";
import { type ApiFailure, dangerAlerts, roleStorageState, trackApiFailures } from "./support/roles";

/**
 * Smoke por papel (#204): com a sessão real de cada papel, percorre cada item
 * visível do menu e falha em qualquer 4xx/5xx de `/api/*` ou alerta de erro na
 * página. Foi a falta disso que deixou os 403 da #188/#189 passarem com a
 * suíte inteira verde (ela só rodava como Super Admin).
 *
 * Menu e dashboard ainda ignoram o papel (#199): mostram ao Atendente e ao
 * Profissional telas e cartões que não são deles. Essas lacunas ficam em
 * `KNOWN_GAPS`, sempre com a issue que as cobre: nelas só o `403` das rotas
 * listadas é tolerado (a política nega na borda, como deve) e fica anotado no
 * relatório — qualquer outro erro (5xx, 404, 401, 403 em outra rota) reprova.
 * Quando a #199 esconder o item do menu, a entrada vira inútil e o teste avisa.
 */
interface KnownGap {
  issue: string;
  /** Prefixos de `/api/*` cujo 403 é esperado nesta tela; `"*"` = tela inteira fora do papel. */
  apis: readonly string[] | "*";
}

const OUT_OF_ROLE: KnownGap = { issue: "#199", apis: "*" };
/** Dashboard mostra cartões de faturamento/estoque a todo papel (#199). */
const DASHBOARD_GAP: KnownGap = { issue: "#199", apis: ["/api/summary", "/api/supplies"] };

const KNOWN_GAPS: Record<E2EStaffRole, Readonly<Record<string, KnownGap>>> = {
  company_admin: {},
  atendente: {
    "/": DASHBOARD_GAP,
    // Triagem de fotos é dado clínico: família `clinical`, negada ao Atendente (R3).
    "/triagem": OUT_OF_ROLE,
    "/profissionais": OUT_OF_ROLE,
    "/faturamento": OUT_OF_ROLE,
    "/procedimentos": OUT_OF_ROLE,
    "/materiais": OUT_OF_ROLE,
    "/relatorios": OUT_OF_ROLE,
    "/repasses": OUT_OF_ROLE,
    "/auditoria": OUT_OF_ROLE,
    "/configuracoes": OUT_OF_ROLE,
  },
  profissional: {
    "/": DASHBOARD_GAP,
    "/profissionais": OUT_OF_ROLE,
    "/faturamento": OUT_OF_ROLE,
    "/procedimentos": OUT_OF_ROLE,
    "/materiais": OUT_OF_ROLE,
    "/relatorios": OUT_OF_ROLE,
    "/auditoria": OUT_OF_ROLE,
    "/configuracoes": OUT_OF_ROLE,
  },
};

const isKnown = (gap: KnownGap | undefined, failure: ApiFailure): boolean =>
  gap !== undefined &&
  failure.status === 403 &&
  (gap.apis === "*" || gap.apis.some((api) => failure.path.startsWith(api)));

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

      const gaps = KNOWN_GAPS[role];
      for (const href of menu) {
        const report = await visit(page, href, tracker);
        const gap = gaps[href];
        const unexpected = report.failures.filter((failure) => !isKnown(gap, failure));
        expect.soft(unexpected, `${href}: respostas de erro em /api/*`).toEqual([]);
        if (gap) {
          test.info().annotations.push({
            type: `lacuna conhecida (${gap.issue})`,
            description: `${href}: ${report.failures.map((f) => `${f.status} ${f.path}`).join(", ") || "sem erro"}`,
          });
          continue;
        }
        expect.soft(report.alerts, `${href}: alerta de erro na página`).toEqual([]);
      }

      // Tela fora do papel que já saiu do menu: a #199 chegou e a entrada
      // precisa sair de KNOWN_GAPS.
      const stale = Object.entries(gaps)
        .filter(([href, gap]) => gap.apis === "*" && !menu.includes(href))
        .map(([href]) => href);
      expect(stale, "telas fora do papel que o menu já esconde").toEqual([]);
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
