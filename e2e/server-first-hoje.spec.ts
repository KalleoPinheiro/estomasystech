import { expect, test } from "@playwright/test";
import {
  createCondition,
  createGuardian,
  createPatient,
  linkGuardianAccount,
  linkPortalAccount,
  unique,
} from "./support/api";
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

/**
 * Com pendências reais (foto na triagem e paciente que virou maior de idade), os blocos que só
 * existem com pendência chegam depois do grid e não o empurram: CLS < 0,05 nas 4 larguras.
 */
const CLS_LIMIT_COM_PENDENCIAS = 0.05;
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe("Hoje no servidor: admin com fila de triagem e aviso de maioridade", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const adminCookie = sessionCookie("local", "company_admin");
    await context.addCookies([adminCookie]);
    // Fila com três fotos: a altura do bloco é o que empurrava a agenda.
    for (let i = 0; i < 3; i++) {
      await context.clearCookies();
      await context.addCookies([adminCookie]);
      const patient = await createPatient(page.request, { fullName: `Paciente Hoje CLS ${unique()}` });
      await linkPortalAccount(page.request, "patient", patient);
      const condition = await createCondition(page.request, patient.id, {
        kind: "wound",
        title: `Ferida Hoje CLS ${unique()}`,
      });
      await context.addCookies([sessionCookie(patient.email, "patient")]);
      await page.request.post("/api/portal/patient/consent?purpose=image");
      await page.request.post("/api/portal/patient/photos", {
        multipart: {
          file: { name: "foto.png", mimeType: "image/png", buffer: TINY_PNG },
          conditionId: condition.id,
          note: "para a triagem",
        },
      });
    }
    await context.clearCookies();
    await context.addCookies([adminCookie]);
    const guardian = await createGuardian(page.request, `Resp Hoje CLS ${unique()}`, `resp.${unique()}@e2e.estomasystech.test`);
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 19);
    await createPatient(page.request, {
      fullName: `Maior Hoje CLS ${unique()}`,
      birthDate: birth.toISOString().slice(0, 10),
      guardianId: guardian.id,
    });
    await linkGuardianAccount(page.request, guardian);
    await context.close();
  });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of [360, 390, 768, 1280]) {
    test(`em ${width}px a triagem e a maioridade chegam sem empurrar a agenda`, async ({ page }) => {
      await page.context().addCookies([sessionCookie("local", "company_admin")]);
      await page.setViewportSize({ width, height: 800 });
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
      await expect(page.getByRole("heading", { name: /Fotos de pacientes aguardando triagem/ })).toBeVisible();
      await expect(page.getByText(/18 anos|maioridade/i).first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      const cls = await page.evaluate(() => (window as unknown as { __cls: { cls: number } }).__cls.cls);
      expect(cls, "CLS da Hoje com pendências").toBeLessThan(CLS_LIMIT_COM_PENDENCIAS);
    });
  }
});
