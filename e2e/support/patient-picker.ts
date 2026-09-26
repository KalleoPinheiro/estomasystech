import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Seleciona o paciente no `PatientPicker` (#197): busca pelo nome e clica no
 * resultado. Substitui o antigo `<select>` que só listava os 100 primeiros.
 */
export async function pickPatient(
  scope: Page | Locator,
  fullName: string,
  label = "Paciente *",
): Promise<void> {
  await scope.getByLabel(label).fill(fullName);
  await scope
    .getByRole("list", { name: "Pacientes encontrados" })
    .getByRole("button", { name: fullName, exact: true })
    .click();
  await expect(scope.locator("[data-patient-picker-selected]")).toHaveText(fullName);
}
