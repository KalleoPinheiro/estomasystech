import { test, expect, type Page } from "@playwright/test";
import { createAppointment, createPartner, createPatient, linkPortalAccount, unique } from "./support/api";
import { toApiDatetime } from "./support/iso-datetime";
import { adminApi } from "./support/roles";
import { slotFromSeed } from "./support/slots";
import { loadSeedData } from "./support/seed-data";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #543: console limpo. Percorre as rotas principais de cada papel (equipe, portal do paciente
 * e do parceiro) e falha em qualquer `console.error`/`console.warn`, exceção não tratada da
 * página, violação de CSP ou hydration mismatch (o React 19 reporta como erro de console).
 * Roda no build de produção (CSP estrita, nonce) e no `next dev` (avisos de desenvolvimento).
 * As sessões são cookies assinados, que valem nos dois modos: o convite das contas reais só
 * existe no log do `next dev`.
 */
const WIDTHS = [360, 1280];

const ADMIN_EXTRA_ROUTES = [
  "/configuracoes/identidade",
  "/configuracoes/horarios",
  "/configuracoes/feriados",
  "/configuracoes/contas",
  "/configuracoes/privacidade",
  "/configuracoes/dados",
  "/configuracoes/email",
  "/auditoria",
];

type Problems = () => string[];

/** Coleta tudo o que suja o console: erro, aviso, exceção da página e violação de CSP. */
async function watchConsole(page: Page): Promise<Problems> {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`[console.${message.type()}] ${message.text()} (${message.location().url})`);
    }
  });
  page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Content Security Policy: ${event.violatedDirective} bloqueou ${event.blockedURI || "inline"}`);
    });
  });
  return () => problems;
}

async function menuRoutes(page: Page): Promise<string[]> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Agenda" }) });
  await expect(nav.getByRole("link", { name: "Agenda" })).toBeVisible();
  const hrefs = await nav.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  // `/minha-conta` lê a conta real (`/api/me`, 404 para cookie assinado sem conta), que só existe no `next dev`.
  return [...new Set(hrefs.filter((href) => href.startsWith("/") && href !== "/minha-conta"))];
}

async function visitClean(page: Page, problems: Problems, route: string): Promise<void> {
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  expect(problems(), `console sujo em ${route}`).toEqual([]);
}

async function signIn(page: Page, subject: string, role: UserRole): Promise<void> {
  await page.context().addCookies([sessionCookie(subject, role)]);
}

for (const role of ["company_admin", "atendente", "profissional"] as const) {
  test.describe(`console limpo: ${role}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const width of WIDTHS) {
      test(`rotas do papel em ${width}px sem erro nem aviso de console`, async ({ page }) => {
        await signIn(page, `console-limpo-${role}@estomasystech.test`, role);
        const menu = await menuRoutes(page);
        await page.setViewportSize({ width, height: 800 });
        const problems = await watchConsole(page);
        const seed = loadSeedData();
        const extra = role === "company_admin" ? ADMIN_EXTRA_ROUTES : [];
        // O profissional forjado não tem conta ligada ao cadastro, logo não tem vínculo com o paciente.
        const record = role === "profissional" ? [] : [`/pacientes/${seed.linkedPatientId}`];
        const routes = [...new Set([...menu, ...record, ...extra])];
        for (const route of routes) await visitClean(page, problems, route);
      });
    }
  });
}

test.describe("console limpo: portal", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of WIDTHS) {
    test(`portal do paciente e do parceiro em ${width}px sem erro nem aviso de console`, async ({ page }) => {
      const admin = await adminApi();
      try {
        const partner = await createPartner(admin, { fullName: `Dr. Console ${unique()}` });
        const patient = await createPatient(admin, {
          fullName: `Paciente Console ${unique()}`,
          referredByPartnerId: partner.id,
        });
        const slot = slotFromSeed("console-limpo-portal", { attempt: WIDTHS.indexOf(width) });
        await createAppointment(admin, {
          patientId: patient.id,
          startsAt: toApiDatetime(slot.startsAt),
          endsAt: toApiDatetime(slot.endsAt),
          procedure: `Curativo console ${unique()}`,
          priceCents: 12000,
        });
        await linkPortalAccount(admin, "patient", patient);
        await linkPortalAccount(admin, "partner", partner);

        await page.setViewportSize({ width, height: 800 });
        const problems = await watchConsole(page);
        await signIn(page, patient.email, "patient");
        await visitClean(page, problems, "/portal");
        await page.context().clearCookies();
        await signIn(page, partner.email, "partner");
        await visitClean(page, problems, "/portal");
      } finally {
        await admin.dispose();
      }
    });
  }

  test("telas públicas sem erro nem aviso de console", async ({ page }) => {
    const problems = await watchConsole(page);
    for (const route of ["/login", "/esqueci-senha", "/privacidade"]) await visitClean(page, problems, route);
  });
});
