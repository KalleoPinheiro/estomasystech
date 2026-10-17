import { expect, test } from "@playwright/test";
import { apiPost } from "./support/api";
import { MAIN_BASE_URL, SUPER_ADMIN_STORAGE_STATE_PATH } from "./support/constants";
import { totpCode, totpStep } from "./support/totp";
import { validCnpj } from "./support/cnpj";

/**
 * B5 (#214, Journey 7 e 8): conta de clínica suspensa não entra, e volta a
 * entrar depois da reativação. O convite do admin da clínica do teste vem na
 * resposta da criação (`admin.inviteUrl`, C2 #265).
 */
const STAFF_MESSAGE = "O acesso desta clínica está suspenso. Fale com o responsável pela clínica.";
const PASSWORD = "senha-da-clinica-suspensa-123";
// IP de documentação (RFC 5737) próprio: login e definir senha têm limite de
// 5/min por IP, e o global-setup já gastou o do loopback.
const LOGIN_IP = "198.51.100.215";

test.describe("clínica suspensa", () => {
  test.use({ storageState: SUPER_ADMIN_STORAGE_STATE_PATH });

  test("login de clínica suspensa mostra a mensagem e volta após reativar", async ({ page, browser }) => {
    const digits = String(Date.now()).slice(-12).padStart(12, "0");
    const adminEmail = `admin-${digits}@suspensa-e2e.test`;
    // C2 (#265): o convite do 1º admin nunca sai por e-mail; o link volta na resposta.
    const { clinic, admin } = await apiPost<{ clinic: { id: string }; admin: { inviteUrl: string } }>(
      page.request,
      "/api/platform/clinics",
      {
        name: `Clínica Suspensa ${digits}`,
        cnpj: validCnpj(`${digits.slice(0, 11)}3`),
        contactPhone: "11 3333-4444",
        contactEmail: "contato@suspensa-e2e.test",
        adminEmail,
      },
    );
    const token = new URL(admin.inviteUrl).searchParams.get("token");
    const setPassword = await page.request.post("/api/auth/set-password", {
      data: { token, password: PASSWORD },
      headers: { "x-forwarded-for": LOGIN_IP },
    });
    expect(setPassword.status()).toBe(200);
    await apiPost(page.request, `/api/platform/clinics/${clinic.id}/suspend`, { reason: "other" });

    const member = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL: MAIN_BASE_URL,
      extraHTTPHeaders: { "x-forwarded-for": LOGIN_IP },
    });
    const memberPage = await member.newPage();
    const login = async () => {
      await memberPage.goto("/login");
      await memberPage.getByLabel("Email", { exact: true }).fill(adminEmail);
      await memberPage.getByLabel("Senha", { exact: true }).fill(PASSWORD);
      await memberPage.getByRole("button", { name: "Entrar" }).click();
    };

    await login();
    await expect(memberPage.getByRole("alert").filter({ hasText: STAFF_MESSAGE })).toHaveText(STAFF_MESSAGE);
    await expect(memberPage).toHaveURL(/\/login/);

    await apiPost(page.request, `/api/platform/clinics/${clinic.id}/reactivate`, {});
    await login();
    // Admin de Empresa sem segundo fator é levado ao cadastro do autenticador (#291).
    await expect(memberPage.getByRole("heading", { name: "Cadastre o app autenticador" })).toBeVisible();
    const secret = (await memberPage.getByTestId("mfa-secret").textContent())?.trim() ?? "";
    await memberPage.getByLabel("Código do autenticador", { exact: true }).fill(totpCode(secret, totpStep()));
    await memberPage.getByRole("button", { name: "Confirmar" }).click();
    await expect(memberPage.getByRole("list", { name: "Códigos de recuperação" }).getByRole("listitem")).toHaveCount(10);
    await memberPage.getByRole("button", { name: "Continuar" }).click();
    await expect(memberPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await member.close();
  });
});
