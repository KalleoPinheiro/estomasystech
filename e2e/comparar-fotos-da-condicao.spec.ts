import { expect, test } from "@playwright/test";
import { addAssessment, createCondition, createPatient, linkPortalAccount, unique } from "./support/api";
import { sessionCookie } from "./support/session-token";

/**
 * #907: a ficha compara duas fotos da condição à escolha (padrão primeira × última), com a avaliação
 * TIME mais próxima de cada uma. Empilha em 360 e 390 px, lado a lado a partir de 640 px.
 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const ADMIN_COOKIE = sessionCookie("local", "company_admin");

for (const largura of [360, 390, 768, 1280]) {
  test(`compara duas fotos à escolha em ${largura}px`, async ({ page, request }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    const patient = await createPatient(request, { fullName: `Paciente Comparar ${unique()}` });
    await linkPortalAccount(request, "patient", patient);
    const condition = await createCondition(request, patient.id, { kind: "wound", title: `Ferida ${unique()}` });
    await addAssessment(request, condition.id, { infectionLevel: "local" });

    await page.context().addCookies([sessionCookie(patient.email, "patient")]);
    expect((await page.request.post("/api/portal/patient/consent?purpose=image")).ok()).toBe(true);
    for (let i = 0; i < 3; i += 1) {
      const upload = await page.request.post("/api/portal/patient/photos", {
        multipart: {
          file: { name: `foto${i}.png`, mimeType: "image/png", buffer: TINY_PNG },
          conditionId: condition.id,
          note: `foto ${i}`,
        },
      });
      expect(upload.ok()).toBe(true);
    }

    await page.context().clearCookies();
    await page.context().addCookies([ADMIN_COOKIE]);
    await page.goto(`/pacientes/${patient.id}`);
    await page.getByRole("tab", { name: /Estomias e feridas/ }).click();
    await page.getByRole("button", { name: "Ver avaliações" }).click();

    const painel = page.locator("[data-photo-compare]");
    await expect(painel.getByText(/^Primeira — /)).toBeVisible();
    await expect(painel.getByText(/^Atual — /)).toBeVisible();
    await expect(painel.locator("[data-compare-assessment]").first()).toContainText("Avaliação de");

    const painéis = painel.locator("figure");
    await expect(painéis).toHaveCount(2);
    const a = (await painéis.nth(0).boundingBox())!;
    const b = (await painéis.nth(1).boundingBox())!;
    if (largura < 640) {
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
    } else {
      expect(Math.abs(b.y - a.y)).toBeLessThan(2);
      expect(b.x).toBeGreaterThan(a.x);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await painel.getByRole("button", { name: "Escolher fotos" }).click();
    const foto1 = painel.getByLabel("Foto 1");
    const foto2 = painel.getByLabel("Foto 2");
    const valores = await foto1.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(valores).toHaveLength(3);
    await expect(foto1).toHaveValue(valores[0]);
    await expect(foto2).toHaveValue(valores[2]);

    await foto1.selectOption(valores[1]);
    await expect(painel.getByText(/^Foto 1 — /)).toBeVisible();
    await expect(painel.locator(`img[src$="/api/photos/${valores[1]}"]`)).toBeVisible();
    await expect(painel.locator(`img[src$="/api/photos/${valores[2]}"]`)).toBeVisible();
    await expect(painel.locator(`img[src$="/api/photos/${valores[0]}"]`)).toHaveCount(0);

    await painel.getByRole("button", { name: "Voltar a primeira × última" }).click();
    await expect(painel.getByText(/^Primeira — /)).toBeVisible();
    await expect(painel.locator(`img[src$="/api/photos/${valores[0]}"]`)).toBeVisible();
  });
}
