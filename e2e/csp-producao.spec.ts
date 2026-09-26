import { test, expect, type Page } from "@playwright/test";
import { createPatient, unique } from "./support/api";
import { sessionCookie } from "./support/session-token";

/**
 * Issue #203: com `next dev` a CSP inclui 'unsafe-eval'/'unsafe-inline'
 * (src/proxy.ts), então violações da CSP estrita de produção — como a da #134 —
 * passavam. No CI este spec roda também contra `next build && next start`
 * (playwright.prod.config.ts) e falha em qualquer violação nas telas centrais:
 * login, agenda, prontuário e portal.
 */

async function collectCspViolations(page: Page): Promise<() => string[]> {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(
        `Content Security Policy: ${event.violatedDirective} bloqueou ${event.blockedURI || "inline"} em ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });
  return () => violations;
}

async function visit(page: Page, url: string, ready: () => Promise<void>) {
  await page.goto(url);
  await ready();
  // Hidratação e chamadas da tela terminam antes de ler as violações.
  await page.waitForLoadState("networkidle");
}

test.describe("CSP estrita nas telas centrais (#203)", () => {
  test("login sem violação de CSP", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const violations = await collectCspViolations(page);

    await visit(page, "/login", async () => {
      await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    });

    expect(violations()).toEqual([]);
    await context.close();
  });

  test("agenda e prontuário sem violação de CSP", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente CSP ${unique()}` });
    const violations = await collectCspViolations(page);

    await visit(page, "/agenda", async () => {
      await expect(page.getByRole("button", { name: "+ Nova consulta" })).toBeVisible();
    });
    await visit(page, `/pacientes/${patient.id}`, async () => {
      await expect(page.getByRole("tablist", { name: "Seções do prontuário" })).toBeVisible();
    });

    expect(violations()).toEqual([]);
  });

  test("portal do paciente sem violação de CSP", async ({ browser, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente CSP Portal ${unique()}` });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await context.addCookies([sessionCookie(patient.email, "patient")]);
    const page = await context.newPage();
    const violations = await collectCspViolations(page);

    await visit(page, "/portal", async () => {
      await expect(
        page.getByRole("heading", { name: `Olá, ${patient.fullName.split(" ")[0]}!` }),
      ).toBeVisible();
    });

    expect(violations()).toEqual([]);
    await context.close();
  });
});
