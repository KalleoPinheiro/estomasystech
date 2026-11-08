import { expect, type Page, test } from "@playwright/test";
import { E2E_ROLE_PASSWORD, ROLE_ACCOUNTS, SESSION_COOKIE_NAME } from "./support/constants";
import { mintSessionToken } from "./support/session-token";
import { nextTotpCode, totpStatePath } from "./support/totp";

/**
 * #718: Sair com a sessão vencida leva ao login (antes, o 401 cru do proxy
 * ficava sem feedback). #719: ao entrar na etapa do 2FA o campo do código já
 * está focado. Login real (sessão própria, nunca a da suíte).
 */
test.use({
  storageState: { cookies: [], origins: [] },
  // Balde de login próprio (RFC 5737), como em `sessao-expirada.spec.ts`.
  extraHTTPHeaders: { "x-forwarded-for": "198.51.100.218" },
});

const ACCOUNT = ROLE_ACCOUNTS.company_admin.email;

const submitPassword = async (page: Page): Promise<void> => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(ACCOUNT);
  await page.getByLabel("Senha", { exact: true }).fill(E2E_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
};

const VIEWPORTS = [360, 390, 768, 1280] as const;

for (const width of VIEWPORTS) {
  test(`etapa do 2FA abre com o campo do código focado em ${width}px`, async ({ page }) => {
    // Resposta do login simulada: o limite de tentativas por conta (5/min) não comporta 4 logins reais seguidos.
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { mfaRequired: true, pendingToken: "pendente" }, error: null }),
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await submitPassword(page);

    await expect(page.getByLabel("Código do autenticador", { exact: true })).toBeFocused();
  });
}

// Balde próprio: o login tem limite de 5/min por IP e os 4 testes de foco já gastaram o deles.
test.describe("Sair com a sessão vencida", () => {
  test.use({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.219" } });

test("leva ao login e limpa o cookie", async ({ page }) => {
  await submitPassword(page);
  await page.getByLabel("Código do autenticador", { exact: true }).fill(await nextTotpCode(totpStatePath(ACCOUNT)));
  await page.getByRole("button", { name: "Verificar" }).click();
  const sair = page.getByRole("button", { name: "Sair" });
  await expect(sair).toBeVisible();

  // O que o navegador teria horas depois: a página segue aberta, o cookie venceu.
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: mintSessionToken(ACCOUNT, "company_admin", undefined, -60_000),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const logout = page.waitForResponse((response) => response.url().endsWith("/api/auth/logout"));
  await sair.click();

  expect((await logout).status()).toBe(200);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)?.value ?? "").toBe("");
});
});
