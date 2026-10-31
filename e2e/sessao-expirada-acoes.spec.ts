import { expect, type Page, test } from "@playwright/test";
import { createPatient } from "./support/api";
import { expectToast } from "./support/assertions";
import { E2E_ROLE_PASSWORD, ROLE_ACCOUNTS, SESSION_COOKIE_NAME } from "./support/constants";
import { adminApi } from "./support/roles";
import { mintSessionToken } from "./support/session-token";
import { nextTotpCode, totpStatePath } from "./support/totp";

/**
 * Sessão vencida numa Server Action da ficha (#552, #207, ADR-080): o POST da ação não pode levar um
 * 307 do proxy, senão a tela não vê «Não autenticado» e o rascunho se perde. A ação responde o envelope,
 * a tela guarda o rascunho e vai ao login; depois do login o texto volta. Login real, em 360 e 1280.
 */
// Começa logado como a conta real do Admin (sessão do global-setup): só o login depois do vencimento gasta um passo de TOTP.
test.use({ storageState: ROLE_ACCOUNTS.company_admin.storageState });

const ACCOUNT = ROLE_ACCOUNTS.company_admin.email;
const WIDTHS = [
  { width: 360, height: 740, bucket: "198.51.100.208" },
  { width: 1280, height: 800, bucket: "198.51.100.209" },
];

const signIn = async (page: Page): Promise<void> => {
  await page.getByLabel("Email", { exact: true }).fill(ACCOUNT);
  await page.getByLabel("Senha", { exact: true }).fill(E2E_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Código do autenticador", { exact: true }).fill(await nextTotpCode(totpStatePath(ACCOUNT)));
  await page.getByRole("button", { name: "Verificar" }).click();
};

const expireSession = async (page: Page): Promise<void> => {
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
};

for (const { width, height, bucket } of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height }, extraHTTPHeaders: { "x-forwarded-for": bucket } });

    test("anamnese salva com a sessão vencida: a ação responde, o rascunho é guardado e volta depois do login", async ({ page }) => {
      const api = await adminApi();
      const patient = await createPatient(api);
      await api.dispose();
      const record = `/pacientes/${patient.id}`;
      await page.goto(record);
      await expect(page).toHaveURL(record);
      const note = `Alergia a látex, iodo e dipirona ${width}`;

      await page.getByLabel(/Alergias/).fill(note);
      await expireSession(page);
      await page.getByRole("button", { name: "Salvar anamnese" }).click();

      await expect(page).toHaveURL(`/login?error=session_expired&next=${encodeURIComponent(record)}`);
      await expect(page.getByText("Sua sessão expirou. Entre novamente.")).toBeVisible();

      await signIn(page);
      await expect(page).toHaveURL(record);
      await expect(page.getByText(/Recuperamos o texto que não foi salvo/)).toBeVisible();
      await expect(page.getByLabel(/Alergias/)).toHaveValue(note);
      await page.getByRole("button", { name: "Salvar anamnese" }).click();
      await expectToast(page, "Anamnese salva");
    });
  });
}
