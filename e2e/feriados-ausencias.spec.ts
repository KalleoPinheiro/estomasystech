import { test, expect } from "@playwright/test";
import { createProfessional, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { businessDay, ymdToDateInput } from "./support/dates";

const SEED_PROFESSIONAL = "Enf. Semente E2E";

test.describe("feriados e ausências", () => {
  test("admin cadastra a ausência de um profissional e remove em seguida", async ({ page, request }) => {
    const professional = await createProfessional(request, { fullName: `Dra. Ausente ${unique()}` });
    // Ausência só do profissional criado aqui: não afeta horários de outros specs.
    const day = ymdToDateInput(businessDay(120 + test.info().retry * 7));
    const reason = `Congresso ${unique()}`;

    await page.goto("/configuracoes/feriados");
    await expect(page.getByRole("heading", { name: "Feriados e ausências" })).toBeVisible();
    await page.getByLabel("Quem").selectOption({ label: professional.fullName });
    await page.getByLabel("De *").fill(day);
    await page.getByLabel("Motivo *").fill(reason);
    await page.getByRole("button", { name: "Adicionar bloqueio" }).click();
    await expectToast(page, "Bloqueio cadastrado");

    const row = page.getByRole("row", { name: new RegExp(reason) });
    await expect(row).toContainText(professional.fullName);

    await row.getByRole("button", { name: "Remover" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expectToast(page, "Bloqueio removido");
    await expect(page.getByRole("row", { name: new RegExp(reason) })).toHaveCount(0);
  });
});
