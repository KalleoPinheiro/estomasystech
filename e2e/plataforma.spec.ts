import { test, expect } from "@playwright/test";
import { sessionCookie } from "./support/session-token";

/**
 * B1 (#214, ADR-007): o super_admin é o operador da plataforma. Sessão assinada
 * de um sujeito sem conta — o logout aqui não revoga o Super Admin que o
 * global-setup usou, e sessão sem conta não é revogada (ADR-005).
 */
const superAdminCookie = () => sessionCookie("plataforma-e2e@vitta.test", "super_admin", "localhost", null);

test.describe("área da plataforma", () => {
  test.describe("como super_admin", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("abre /plataforma sem a sidebar da equipe", async ({ page, context }) => {
      await context.addCookies([superAdminCookie()]);
      await page.goto("/plataforma");

      await expect(page.getByRole("heading", { level: 1, name: "Plataforma" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(0);
    });

    test("tela da clínica leva o super_admin a /plataforma", async ({ page, context }) => {
      await context.addCookies([superAdminCookie()]);
      await page.goto("/agenda");

      await expect(page).toHaveURL("/plataforma");
    });

    test("Sair encerra a sessão e volta para o login", async ({ page, context }) => {
      await context.addCookies([superAdminCookie()]);
      await page.goto("/plataforma");
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
