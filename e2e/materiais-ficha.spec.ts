import { expect, test } from "@playwright/test";
import { createSupply, unique } from "./support/api";

test.describe("materiais: lista + ficha", () => {
  test("Admin edita o insumo na ficha ao lado da lista, sem abrir janela", async ({ page, request }) => {
    const supply = await createSupply(request, { name: `Insumo ficha ${unique()}` });

    await page.goto("/materiais");
    await page.getByRole("row").filter({ hasText: supply.name }).getByRole("button", { name: "Editar" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Editar insumo" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar ficha" }).click();
    await expect(page.getByRole("heading", { name: "Editar insumo" })).toHaveCount(0);
  });

  test.describe("no celular", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Editar sobe a folha de baixo e Cancelar fecha sem salvar", async ({ page, request }) => {
      await createSupply(request, { name: `Insumo folha ${unique()}` });

      await page.goto("/materiais");
      await page.getByRole("button", { name: "Editar" }).first().click();
      const folha = page.getByRole("dialog");
      await expect(folha).toBeVisible();
      await folha.getByRole("button", { name: "Cancelar" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });
});
