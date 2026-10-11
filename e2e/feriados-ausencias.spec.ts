import { test, expect } from "@playwright/test";
import { createProfessional, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { businessDay, ymdToDateInput } from "./support/dates";
import { roleStorageState, trackApiFailures } from "./support/roles";

const SEED_PROFESSIONAL = "Enf. Semente E2E";

test.describe("feriados e ausências", () => {
  test("admin cadastra a ausência de um profissional e remove em seguida", async ({ page, request }) => {
    const professional = await createProfessional(request, { fullName: `Dra. Ausente ${unique()}` });
    // Ausência só do profissional criado aqui: não afeta horários de outros specs.
    const day = ymdToDateInput(businessDay(120 + test.info().retry * 7));
    const reason = `Congresso ${unique()}`;

    await page.goto("/configuracoes");
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

/**
 * #215: o Profissional registra e remove só a própria ausência; a grade e os
 * feriados da clínica ficam com Admin (grade) e Admin/Atendente (feriados).
 */
test.describe("feriados e ausências — profissional", () => {
  test.use({ storageState: roleStorageState("profissional") });

  test("profissional vê só Feriados e ausências e registra a própria ausência", async ({ page }) => {
    const failures = trackApiFailures(page);
    const day = ymdToDateInput(businessDay(150 + test.info().retry * 7));
    const reason = `Congresso próprio ${unique()}`;

    await page.goto("/configuracoes");
    await expect(page.getByRole("heading", { name: "Feriados e ausências" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Grade de horários" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Dados da clínica" })).toHaveCount(0);
    await expect(page.getByLabel("Quem").locator("option")).toHaveText([SEED_PROFESSIONAL]);

    await page.getByLabel("De *").fill(day);
    await page.getByLabel("Motivo *").fill(reason);
    await page.getByRole("button", { name: "Adicionar bloqueio" }).click();
    await expectToast(page, "Bloqueio cadastrado");

    const row = page.getByRole("row", { name: new RegExp(reason) });
    await expect(row).toContainText(SEED_PROFESSIONAL);
    await row.getByRole("button", { name: "Remover" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expectToast(page, "Bloqueio removido");
    expect(failures.list()).toEqual([]);

    const holiday = await page.request.post("/api/settings/schedule/closures", {
      data: { startsOn: day, reason: "Feriado indevido" },
    });
    expect(holiday.status()).toBe(403);
    const schedule = await page.request.put("/api/settings/schedule", { data: {} });
    expect(schedule.status()).toBe(403);
  });
});
