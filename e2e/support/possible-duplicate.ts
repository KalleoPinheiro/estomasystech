import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Depois de «Salvar» no cadastro novo (#992): espera o paciente aparecer na lista ou o aviso de
 * possível repetido; no aviso, escolhe «Cadastrar mesmo assim».
 */
export async function confirmIfPossibleDuplicate(page: Page, created: Locator): Promise<void> {
  const anyway = page.getByRole("button", { name: "Cadastrar mesmo assim" });
  await expect(created.or(anyway)).toBeVisible();
  if (await anyway.isVisible()) {
    await anyway.click();
  }
}
