import { expect, test } from "@playwright/test";
import { createPartner, createProfessional, unique } from "./support/api";

test.describe("lista + ficha: parceiros e profissionais", () => {
  test("Parceiros: Editar abre a ficha ao lado da lista, sem janela", async ({ page, request }) => {
    const partner = await createPartner(request, { fullName: `Parceiro ficha ${unique()}` });

    await page.goto("/parceiros");
    await page.getByRole("row").filter({ hasText: partner.fullName }).getByRole("button", { name: "Editar" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Editar parceiro" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar ficha" }).click();
    await expect(page.getByRole("heading", { name: "Editar parceiro" })).toHaveCount(0);
  });

  test("Profissionais: Editar abre a ficha ao lado da lista, sem janela", async ({ page, request }) => {
    const professional = await createProfessional(request, { fullName: `Profissional ficha ${unique()}` });

    await page.goto("/profissionais");
    await page
      .getByRole("row")
      .filter({ hasText: professional.fullName })
      .getByRole("button", { name: "Editar" })
      .click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Editar profissional" })).toBeVisible();
    await page.getByRole("button", { name: "Fechar ficha" }).click();
    await expect(page.getByRole("heading", { name: "Editar profissional" })).toHaveCount(0);
  });

  test.describe("no celular", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Parceiros e Profissionais: Editar sobe a folha de baixo e Cancelar fecha sem salvar", async ({ page, request }) => {
      await createPartner(request, { fullName: `Parceiro folha ${unique()}` });
      await createProfessional(request, { fullName: `Profissional folha ${unique()}` });

      for (const rota of ["/parceiros", "/profissionais"]) {
        await page.goto(rota);
        await page.getByRole("button", { name: "Editar" }).first().click();
        const folha = page.getByRole("dialog");
        await expect(folha).toBeVisible();
        await folha.getByRole("button", { name: "Cancelar" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
    });
  });
});
