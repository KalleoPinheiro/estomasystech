import { test, expect } from "@playwright/test";
import { createPatient, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { businessDay, ymdToDateInput } from "./support/dates";
import { pickPatient } from "./support/patient-picker";

test.describe("lista de espera", () => {
  test("recepção põe paciente na lista de espera pela agenda e remove", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Espera ${unique()}` });
    const from = ymdToDateInput(businessDay(10));
    const to = ymdToDateInput(businessDay(30));

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Adicionar" }).click();
    const dialog = page.getByRole("dialog", { name: "Adicionar à lista de espera" });
    await pickPatient(dialog, patient.fullName);
    await dialog.getByLabel("Aceita a partir de *").fill(from);
    await dialog.getByLabel("Até *").fill(to);
    await dialog.getByLabel("Observação").fill("Só de manhã");
    await dialog.getByRole("button", { name: "Adicionar à lista" }).click();
    await expectToast(page, "Adicionado à lista de espera");

    const item = page.locator("li", { hasText: patient.fullName });
    await expect(item).toContainText("Só de manhã");
    await item.getByRole("button", { name: "Remover" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expectToast(page, "Removido da lista de espera");
    await expect(page.locator("li", { hasText: patient.fullName })).toHaveCount(0);
  });
});
