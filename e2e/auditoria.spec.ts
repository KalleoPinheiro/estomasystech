import { test, expect } from "@playwright/test";
import { createCondition, createPatient, unique } from "./support/api";
import { pickPatient } from "./support/patient-picker";

test.describe("auditoria de prontuário", () => {
  test("criação de condição clínica gera evento de auditoria visível na trilha", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { fullName: `Paciente Auditoria ${unique()}` });
    await createCondition(request, patient.id, {
      kind: "wound",
      title: `Ferida auditada E2E ${unique()}`,
    });

    await page.goto("/auditoria");
    await expect(page.getByRole("heading", { name: "Auditoria de prontuário" })).toBeVisible();

    // Filtra pelo paciente para achar o evento de forma determinística.
    await pickPatient(page, patient.fullName, "Filtrar por paciente");

    const row = page.getByRole("row", { name: /Criação/ }).filter({ hasText: "Condição" });
    await expect(row).toBeVisible();
    await expect(row.getByText("company_admin")).toBeVisible();
    await expect(row.getByText(patient.fullName)).toBeVisible();
  });

  test("filtro por paciente esconde eventos de outros pacientes", async ({ page, request }) => {
    const target = await createPatient(request, { fullName: `Paciente Alvo Auditoria ${unique()}` });
    const other = await createPatient(request, { fullName: `Paciente Outro Auditoria ${unique()}` });
    await createCondition(request, target.id, { kind: "wound", title: `Ferida alvo ${unique()}` });
    await createCondition(request, other.id, { kind: "wound", title: `Ferida outra ${unique()}` });

    await page.goto("/auditoria");
    await pickPatient(page, target.fullName, "Filtrar por paciente");

    await expect(page.getByRole("cell", { name: target.fullName }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: other.fullName })).toHaveCount(0);
  });
});
