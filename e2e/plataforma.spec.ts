import { test, expect } from "@playwright/test";
import { E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD, SUPER_ADMIN_STORAGE_STATE_PATH } from "./support/constants";
import { nextTotpCode } from "./support/totp";

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
      await expect(page.getByRole("navigation")).toHaveCount(0);
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
