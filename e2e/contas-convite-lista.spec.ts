import { expect, test } from "@playwright/test";
import { unique } from "./support/api";

/** A conta convidada aparece na lista sem recarregar a página (QA da staging). */
test("conta recém-convidada aparece na lista sem recarregar", async ({ page }) => {
  const email = `convidado-${unique()}@estomasystech.test`;

  await page.goto("/configuracoes/contas");
  await page.getByRole("button", { name: "+ Nova conta" }).click();
  await page.getByLabel("Email *").fill(email);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Nova conta de acesso" })).not.toBeVisible();
  await expect(page.getByRole("cell", { name: email })).toBeVisible();
});
