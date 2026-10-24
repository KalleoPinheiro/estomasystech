import { expect, test } from "@playwright/test";
import { createProcedure, unique } from "./support/api";

test.describe("procedimentos: lista + ficha", () => {
  test("Admin edita o procedimento na ficha ao lado da lista, sem abrir janela", async ({ page, request }) => {
    const procedure = await createProcedure(request, { name: `Procedimento ficha ${unique()}` });
    const novoNome = `${procedure.name} (editado)`;

    await page.goto("/procedimentos");
    const linha = page.getByRole("row").filter({ hasText: procedure.name });
    await linha.getByRole("button", { name: "Editar" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Editar procedimento" })).toBeVisible();
    await expect(page.getByRole("row", { selected: true })).toContainText(procedure.name);

    await page.getByLabel(/Nome/).fill(novoNome);
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: "Editar procedimento" })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: novoNome })).toBeVisible();
  });
});
