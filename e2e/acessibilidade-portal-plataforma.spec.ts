import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createPatient, linkPortalAccount, unique } from "./support/api";
import { SUPER_ADMIN_STORAGE_STATE_PATH } from "./support/constants";
import { sessionCookie } from "./support/session-token";

/**
 * Trava de acessibilidade (#429, WCAG 2.2 AA) de definir senha, portal do
 * paciente e Plataforma: nenhuma violação séria ou crítica, em tema claro e
 * escuro, no celular (390px).
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ESQUEMAS = ["light", "dark"] as const;

test.use({ viewport: { width: 390, height: 844 } });

async function prepare(page: Page, esquema: (typeof ESQUEMAS)[number]) {
  await page.emulateMedia({ colorScheme: esquema });
  await page.addInitScript((mode) => {
    localStorage.setItem("estomasystech:modo", JSON.stringify({ mode, accent: "violet" }));
  }, esquema);
}

async function expectSemViolacaoGrave(page: Page, rota: string) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const resultado = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const graves = resultado.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    graves.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} elemento(s), ex.: ${v.nodes[0]?.target.join(" ")}`),
    `Violações em ${rota}`,
  ).toEqual([]);
}

test.describe("definir senha", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const esquema of ESQUEMAS) {
    test(`link inválido (${esquema}) não tem violação séria ou crítica`, async ({ page }) => {
      await prepare(page, esquema);
      await page.goto("/definir-senha?token=invalido");
      await expect(page.locator("main, form").first()).toBeVisible();
      const resultado = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const graves = resultado.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(graves.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  }
});

test.describe("portal do paciente", () => {
  for (const esquema of ESQUEMAS) {
    test(`início do portal (${esquema}) não tem violação séria ou crítica`, async ({ page, context, request }) => {
      const patient = await createPatient(request, { fullName: `Paciente Axe ${unique()}` });
      await linkPortalAccount(request, "patient", patient);
      await context.addCookies([sessionCookie(patient.email, "patient")]);
      await prepare(page, esquema);
      await page.goto("/portal");
      await expectSemViolacaoGrave(page, "/portal");
    });
  }
});

test.describe("Plataforma", () => {
  test.use({ storageState: SUPER_ADMIN_STORAGE_STATE_PATH });
  const rotas = ["/plataforma", "/plataforma/clinicas/nova", "/plataforma/taxonomia", "/plataforma/auditoria", "/plataforma/minha-conta"];
  for (const rota of rotas) {
    for (const esquema of ESQUEMAS) {
      test(`${rota} (${esquema}) não tem violação séria ou crítica`, async ({ page }) => {
        await prepare(page, esquema);
        await page.goto(rota);
        await expectSemViolacaoGrave(page, rota);
      });
    }
  }
});
