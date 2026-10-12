import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createPatient, linkPortalAccount, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { ADMIN_STORAGE_STATE_PATH } from "./support/constants";
import { sessionCookie } from "./support/session-token";

test.describe("portal do paciente — direitos do titular (#293)", () => {
  test("paciente baixa a cópia dos dados, pede correção e vê a resposta do Admin", async ({
    browser,
    context,
    page,
    request,
  }) => {
    const patient = await createPatient(request, {
      fullName: `Titular LGPD ${unique()}`,
    });
    await linkPortalAccount(request, "patient", patient);
    await context.addCookies([sessionCookie(patient.email, "patient")]);
    await page.goto("/portal");

    const section = page.locator("[data-data-rights]");
    await expect(section.getByRole("heading", { name: "Meus dados (LGPD)" })).toBeVisible();
    await expect(section.getByText(/Aviso provisório/)).toBeVisible();

    // Cópia dos próprios dados: o JSON é do titular da sessão.
    const downloadPromise = page.waitForEvent("download");
    await section.getByRole("button", { name: "Baixar cópia dos meus dados" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("meus-dados.json");
    const json = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(json.patient.id).toBe(patient.id);

    // Pedido de correção.
    const details = `Telefone novo ${unique()}`;
    await section.getByLabel("O que precisa ser corrigido?").fill(details);
    await section.getByRole("button", { name: "Enviar pedido" }).click();
    await expectToast(page, "Pedido enviado. A clínica vai analisar.");
    const item = section.locator("[data-data-requests] li", { hasText: details });
    await expect(item.getByText("Em análise")).toBeVisible();

    // Admin de Empresa decide na fila, com justificativa.
    const adminContext = await browser.newContext({ storageState: ADMIN_STORAGE_STATE_PATH });
    const admin = await adminContext.newPage();
    await admin.goto("/pedidos-titular");
    const card = admin.locator("[data-data-request-queue] li", { hasText: details });
    await expect(card.getByText(patient.fullName)).toBeVisible();
    await card.getByLabel(/Justificativa/).fill("Telefone atualizado na ficha");
    await card.getByRole("button", { name: "Aceitar" }).click();
    await expect(card).toHaveCount(0);
    await adminContext.close();

    // O paciente vê a decisão e a justificativa no portal.
    await page.reload();
    const answered = page.locator("[data-data-requests] li", { hasText: details });
    await expect(answered.getByText("Aceito")).toBeVisible();
    await expect(answered.getByText("Telefone atualizado na ficha")).toBeVisible();
  });
});
