import { test, expect } from "@playwright/test";
import { expectToast } from "./support/assertions";

/**
 * C3 (#266): o Admin de Empresa cadastra e remove o canal de e-mail da clínica.
 * O e-mail de teste fica de fora — chamaria o Resend de verdade.
 */
test.describe("canal de e-mail da clínica", () => {
  // Sem canal, os convites dos outros specs seguem pelo gateway nulo (o link
  // vai para o log que `e2e/support/invite-log.ts` lê): nunca deixe um canal.
  test.afterEach(async ({ request }) => {
    await request.delete("/api/settings/email-channel");
  });

  test("admin salva remetente e chave, vê só os 4 últimos caracteres e remove", async ({ page }) => {
    await page.goto("/configuracoes/email");
    const section = page.getByRole("region", { name: "Canal de e-mail" });
    await expect(section.getByText(/^Nenhum canal configurado/)).toBeVisible();
    await expect(section.getByLabel("Provedor")).toHaveValue("resend");

    await section.getByLabel("Remetente").fill("Clínica E2E <contato@clinica-e2e.com.br>");
    await section.getByLabel("Chave de API").fill("re_e2e_chave_falsa_W9X8");
    await section.getByRole("button", { name: "Salvar canal" }).click();
    await expectToast(page, "Canal de e-mail salvo");
    await expect(section.getByText("Chave atual: ••••W9X8")).toBeVisible();
    await expect(section.getByLabel("Chave de API")).toHaveValue("");
    await expect(page.getByText("re_e2e_chave_falsa_W9X8")).toHaveCount(0);

    await section.getByRole("button", { name: "Remover canal" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      "Remover o canal de e-mail? A clínica deixa de enviar e-mails automáticos, convites e redefinições.",
    );
    await dialog.getByRole("button", { name: "Remover canal" }).click();
    await expectToast(page, "Canal de e-mail removido");
    await expect(section.getByText(/^Nenhum canal configurado/)).toBeVisible();
  });
});
