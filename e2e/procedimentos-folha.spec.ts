import { expect, test } from "@playwright/test";
import { createProcedure, unique } from "./support/api";

test.describe("procedimentos: folha de baixo no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Admin edita o procedimento na folha de baixo e cancela sem salvar", async ({ page, request }) => {
    const procedure = await createProcedure(request, { name: `Procedimento folha ${unique()}` });

    await page.goto("/procedimentos");
    await page.getByRole("button", { name: "Editar" }).first().click();

    const folha = page.getByRole("dialog");
    await expect(folha).toBeVisible();
    await expect(folha.getByText("Editar procedimento")).toBeVisible();

    await folha.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(procedure.name)).toBeVisible();
  });
});
