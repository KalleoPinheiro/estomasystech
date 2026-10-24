import { test, expect, type Page } from "@playwright/test";
import { createCondition, createPatient, unique, linkPortalAccount } from "./support/api";
import { sessionCookie } from "./support/session-token";

/**
 * #542 (ADR-069): foto clínica nunca passa pelo otimizador do Next. Ele busca a
 * imagem sem cookie (401) e guardaria o arquivo num cache de disco sem escopo de
 * empresa. Aqui a miniatura tem de carregar direto de `/api/...photos/...`.
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const ADMIN_COOKIE = sessionCookie("local", "company_admin");

async function seedPhoto(page: Page, request: Parameters<typeof createPatient>[0]) {
  const patient = await createPatient(request, { fullName: `Paciente Foto ${unique()}` });
  await linkPortalAccount(request, "patient", patient);
  const condition = await createCondition(request, patient.id, {
    kind: "wound",
    title: `Ferida foto ${unique()}`,
  });
  await page.context().addCookies([sessionCookie(patient.email, "patient")]);
  const consent = await page.request.post("/api/portal/patient/consent?purpose=image");
  expect(consent.ok()).toBe(true);
  const upload = await page.request.post("/api/portal/patient/photos", {
    multipart: {
      file: { name: "foto.png", mimeType: "image/png", buffer: TINY_PNG },
      conditionId: condition.id,
      note: "foto de teste",
    },
  });
  expect(upload.ok()).toBe(true);
  return patient;
}

function otimizadorRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/_next/image")) urls.push(req.url());
  });
  return urls;
}

async function expectThumbsLoaded(page: Page, pathPart: string) {
  const imgs = page.locator(`img[src*="${pathPart}"]`);
  await expect(imgs.first()).toBeVisible();
  await expect
    .poll(() => imgs.evaluateAll((els) => els.every((el) => (el as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
}

for (const width of [360, 1280]) {
  test.describe(`fotos clínicas direto da API em ${width}px (#542)`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("triagem e ficha carregam a miniatura sem o otimizador", async ({ page, request }) => {
      const patient = await seedPhoto(page, request);
      await page.context().addCookies([ADMIN_COOKIE]);
      const viaOtimizador = otimizadorRequests(page);

      await page.goto("/");
      await expect(page.locator("li", { hasText: patient.fullName })).toBeVisible();
      await expectThumbsLoaded(page, "/api/photos/");

      await page.goto(`/pacientes/${patient.id}`);
      await page.getByRole("tab", { name: /Estomias e feridas/ }).click();
      await page.getByRole("button", { name: "Ver avaliações" }).click();
      await expectThumbsLoaded(page, "/api/photos/");

      expect(viaOtimizador).toEqual([]);
    });

    test("portal carrega a miniatura sem o otimizador", async ({ page, request }) => {
      await seedPhoto(page, request);
      const viaOtimizador = otimizadorRequests(page);

      await page.goto("/portal");
      await expectThumbsLoaded(page, "/api/portal/");

      expect(viaOtimizador).toEqual([]);
    });
  });
}

test.describe("otimizador recusa rota autenticada (#542)", () => {
  const url = "/_next/image?url=%2Fapi%2Fphotos%2Fqualquer&w=96&q=75";

  test("com cookie de sessão responde 400", async ({ page }) => {
    expect((await page.request.get(url)).status()).toBe(400);
  });

  test("sem cookie responde 400", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get(url)).status()).toBe(400);
    await anon.dispose();
  });
});
