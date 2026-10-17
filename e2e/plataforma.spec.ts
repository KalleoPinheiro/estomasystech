import { test, expect } from "@playwright/test";
import { E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD, SUPER_ADMIN_STORAGE_STATE_PATH } from "./support/constants";
import { apiPost } from "./support/api";
import { nextTotpCode } from "./support/totp";
import { validCnpj } from "./support/cnpj";

/**
 * B1 (#214, ADR-007): o super_admin é o operador da plataforma. Sessão real
 * (senha + segundo fator): a sessão de sistema é conferida contra a conta de
 * sistema pelo papel (ADR-009), então cookie forjado de outro e-mail não vale.
 */
test.describe("área da plataforma", () => {
  test.describe("como super_admin", () => {
    test.use({ storageState: SUPER_ADMIN_STORAGE_STATE_PATH });

    test("abre /plataforma sem a sidebar da equipe", async ({ page }) => {
      await page.goto("/plataforma");

      await expect(page.getByRole("heading", { level: 1, name: "Plataforma" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Pacientes" })).toHaveCount(0);
    });

    test("navegação da plataforma leva às seções", async ({ page }) => {
      // C4 (#267): Clínicas · Auditoria · Taxonomia, com a seção atual marcada.
      await page.goto("/plataforma");
      const nav = page.getByRole("navigation");
      await expect(nav.getByRole("link")).toHaveText(["Clínicas", "Auditoria", "Taxonomia", "Minha conta"]);
      await expect(nav.getByRole("link", { name: "Clínicas" })).toHaveAttribute("aria-current", "page");

      await nav.getByRole("link", { name: "Taxonomia" }).click();
      await expect(page).toHaveURL("/plataforma/taxonomia");
      await expect(page.getByRole("heading", { level: 1, name: "Taxonomia" })).toBeVisible();
      await expect(page.getByRole("navigation").getByRole("link", { name: "Taxonomia" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    test("importa o catálogo de estomaterapia pela tela", async ({ page }) => {
      // C4 (#267): idempotente — numa base já importada, as contagens são 0.
      await page.goto("/plataforma/taxonomia");
      await page.getByRole("button", { name: "Importar catálogo de estomaterapia" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Importar" }).click();

      for (const label of ["Diagnósticos", "Resultados", "Intervenções", "Ligações"]) {
        await expect(page.getByText(new RegExp(`^${label}: \\d+$`))).toBeVisible();
      }
    });

    test("cria clínica pela tela e vê o admin aguardando primeiro acesso", async ({ page }) => {
      // CNPJ novo a cada execução: `uq_clinics_cnpj` recusa repetido (B4).
      const digits = String(Date.now()).slice(-12).padStart(12, "0");
      const cnpj = validCnpj(`${digits.slice(0, 11)}0`);
      const name = `Clínica E2E ${digits}`;

      await page.goto("/plataforma");
      await expect(page.getByRole("cell", { name: "Clínica E2E", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Nova clínica" }).click();

      await page.getByLabel("Razão social").fill(name);
      await page.getByLabel("CNPJ").fill(cnpj);
      await page.getByLabel("Telefone/WhatsApp de contato").fill("11 3333-4444");
      await page.getByLabel("E-mail de contato").fill("contato@nova-e2e.test");
      await page.getByLabel("E-mail do primeiro admin").fill(`admin-${digits}@nova-e2e.test`);
      await page.getByRole("button", { name: "Criar clínica e convidar admin" }).click();

      // C2 (#265): a clínica nova não tem canal; o convite volta como link para repassar.
      await expect(page.getByLabel("Link de convite do primeiro admin")).toHaveValue(/\/definir-senha\?token=/);
      await page.getByRole("link", { name: "Abrir a clínica" }).click();
      await expect(page).toHaveURL(/\/plataforma\/clinicas\/[^/]+$/);
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      const adminRow = page.getByRole("row").filter({ hasText: `admin-${digits}@nova-e2e.test` });
      await expect(adminRow.getByText("Aguardando primeiro acesso")).toBeVisible();

      await page.getByRole("navigation").getByRole("link", { name: "Clínicas" }).click();
      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row.getByText("Aguardando primeiro acesso")).toBeVisible();
      await expect(row.getByText("Cadastro completo")).toBeVisible();
      // C4 (#267): clínica nova não tem canal de e-mail.
      await expect(row.getByText("E-mail: sem canal")).toBeVisible();
    });

    test("suspende e reativa pela tela", async ({ page }) => {
      // B5: clínica própria do teste — suspender a da sessão padrão derrubaria a suíte.
      const digits = String(Date.now()).slice(-12).padStart(12, "0");
      const name = `Clínica Suspensão ${digits}`;
      const created = await apiPost<{ clinic: { id: string } }>(page.request, "/api/platform/clinics", {
        name,
        cnpj: validCnpj(`${digits.slice(0, 11)}1`),
        contactPhone: "11 3333-4444",
        contactEmail: "contato@suspensao-e2e.test",
        adminEmail: `admin-${digits}@suspensao-e2e.test`,
      });

      await page.goto(`/plataforma/clinicas/${created.clinic.id}`);
      await expect(page.getByText("Clínica ativa.")).toBeVisible();
      await page.getByRole("button", { name: "Suspender clínica" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("button", { name: "Suspender" })).toBeDisabled();
      await dialog.getByLabel("Motivo").selectOption("non_payment");
      await dialog.getByRole("button", { name: "Suspender" }).click();
      await expect(page.getByText(/^Suspensa em .+ por /)).toBeVisible();
      await expect(page.getByText("Inadimplência")).toBeVisible();
      await expect(page.getByRole("button", { name: "Convidar admin" })).toBeDisabled();

      // O voltar "Clínicas" do cabeçalho do detalhe (fora da navegação) continua levando à lista.
      await page.getByRole("main").getByRole("link", { name: "Clínicas" }).click();
      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row.getByText("Suspensa")).toBeVisible();

      await row.getByRole("link", { name }).click();
      await page.getByRole("button", { name: "Reativar clínica" }).click();
      await expect(page.getByText("Clínica ativa.")).toBeVisible();

      await page.getByRole("navigation").getByRole("link", { name: "Clínicas" }).click();
      await expect(page.getByRole("row").filter({ hasText: name }).getByText("Ativa", { exact: true })).toBeVisible();
    });

    test("trilha da plataforma mostra a criação da clínica", async ({ page }) => {
      // B6: ação do super_admin numa clínica entra na trilha de plataforma.
      const digits = String(Date.now()).slice(-12).padStart(12, "0");
      const name = `Clínica Trilha ${digits}`;
      await apiPost(page.request, "/api/platform/clinics", {
        name,
        cnpj: validCnpj(`${digits.slice(0, 11)}2`),
        contactPhone: "11 3333-4444",
        contactEmail: "contato@trilha-e2e.test",
        adminEmail: `admin-${digits}@trilha-e2e.test`,
      });

      await page.goto("/plataforma");
      await page.getByRole("navigation").getByRole("link", { name: "Auditoria" }).click();

      await expect(page.getByRole("heading", { level: 1, name: "Trilha da plataforma" })).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: name }).filter({ hasText: "Criação" });
      await expect(row.filter({ has: page.getByRole("cell", { name: "Clínica", exact: true }) })).toHaveCount(1);
      await expect(row.first().getByText("super_admin")).toBeVisible();
    });

    test("tela da clínica leva o super_admin a /plataforma", async ({ page }) => {
      await page.goto("/agenda");

      await expect(page).toHaveURL("/plataforma");
    });
  });

  test.describe("super_admin saindo", () => {
    // Login próprio: o logout revoga todas as sessões da conta (#194),
    // inclusive a do global-setup que os testes acima usam.
    test.use({ storageState: { cookies: [], origins: [] } });

    test("Sair encerra a sessão e volta para o login", async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(E2E_SUPER_ADMIN_EMAIL);
      await page.getByLabel("Senha", { exact: true }).fill(E2E_SUPER_ADMIN_PASSWORD);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.getByLabel("Código do autenticador", { exact: true }).fill(await nextTotpCode());
      await page.getByRole("button", { name: "Verificar" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Plataforma" })).toBeVisible();

      await page.getByRole("button", { name: "Sair" }).click();
      await expect(page).toHaveURL(/\/login/);

      await page.goto("/plataforma");
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe("como Admin de Empresa (sessão padrão)", () => {
    test("abrir /plataforma redireciona para o dashboard", async ({ page }) => {
      await page.goto("/plataforma");

      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    });

    test("rota antiga de importação responde 404", async ({ request }) => {
      const response = await request.post("/api/admin/taxonomy/import", { data: {} });

      expect(response.status()).toBe(404);
    });

    test("importação do catálogo pela plataforma responde 403", async ({ request }) => {
      const response = await request.post("/api/platform/taxonomy/import", { data: {} });

      expect(response.status()).toBe(403);
    });
  });
});
