import { test, expect } from "@playwright/test";
import { createPartner, createProfessional, unique } from "./support/api";
import { literal } from "./support/regexp";

test.describe("equipe — profissionais", () => {
  test("cria e edita um profissional pela UI", async ({ page }) => {
    const name = `Enf. Criado UI ${unique()}`;
    const editedName = `${name} (editado)`;

    await page.goto("/profissionais");
    await page.getByRole("button", { name: "+ Novo profissional" }).click();
    await page.getByLabel("Nome *").fill(name);
    await page.getByLabel("Registro profissional").fill("COREN-SP 111222");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: "Novo profissional" })).not.toBeVisible();
    const row = page.getByRole("row", { name: literal(name) });
    await expect(row).toBeVisible();
    await expect(row.getByText("COREN-SP 111222")).toBeVisible();

    await row.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome *").fill(editedName);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("heading", { name: "Editar profissional" })).not.toBeVisible();
    await expect(page.getByRole("row", { name: editedName })).toBeVisible();
  });

  test("desativa e reativa um profissional", async ({ page, request }) => {
    const professional = await createProfessional(request, {
      fullName: `Enf. Desativar ${unique()}`,
    });

    await page.goto("/profissionais");
    const row = page.getByRole("row", { name: literal(professional.fullName) });
    await expect(row.getByText("Ativo")).toBeVisible();

    await row.getByRole("button", { name: "Desativar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(row.getByText("Inativo")).toBeVisible();

    await row.getByRole("button", { name: "Reativar" }).click();
    await expect(row.getByText("Ativo")).toBeVisible();
  });
});

test.describe("equipe — parceiros", () => {
  test("cria e edita um parceiro pela UI", async ({ page }) => {
    const name = `Dr. Criado UI ${unique()}`;
    const editedName = `${name} (editado)`;

    await page.goto("/parceiros");
    await page.getByRole("button", { name: "+ Novo parceiro" }).click();
    await page.getByLabel("Nome completo *").fill(name);
    await page.getByLabel("Email *").fill(`${unique()}@e2e.vittaflow.test`);
    await page.getByLabel("Telefone *").fill("11966665555");
    await page.getByLabel("CRM").fill("CRM-SP 987654");
    await page.getByLabel("Especialidade").fill("Angiologia");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: "Novo parceiro" })).not.toBeVisible();
    const row = page.getByRole("row", { name: literal(name) });
    await expect(row).toBeVisible();
    await expect(row.getByText("CRM-SP 987654")).toBeVisible();

    await row.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome completo *").fill(editedName);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("heading", { name: "Editar parceiro" })).not.toBeVisible();
    await expect(page.getByRole("row", { name: editedName })).toBeVisible();
  });

  test("desativa um parceiro", async ({ page, request }) => {
    const partner = await createPartner(request, { fullName: `Dr. Desativar ${unique()}` });

    await page.goto("/parceiros");
    const row = page.getByRole("row", { name: literal(partner.fullName) });
    await expect(row.getByText("Ativo")).toBeVisible();

    await row.getByRole("button", { name: "Desativar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(row.getByText("Inativo")).toBeVisible();
  });

  test("bloqueia cadastro de parceiro com email já usado", async ({ page, request }) => {
    const partner = await createPartner(request, { fullName: `Dr. Duplicado ${unique()}` });

    await page.goto("/parceiros");
    await page.getByRole("button", { name: "+ Novo parceiro" }).click();
    await page.getByLabel("Nome completo *").fill(`Dr. Outro Nome ${unique()}`);
    await page.getByLabel("Email *").fill(partner.email);
    await page.getByLabel("Telefone *").fill("11955554444");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Já existe parceiro com este e-mail")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Novo parceiro" })).toBeVisible();
  });
});
