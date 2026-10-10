import { expect, type Page, test } from "@playwright/test";
import { createPatient } from "./support/api";
import { expectToast } from "./support/assertions";
import { E2E_ROLE_PASSWORD, ROLE_ACCOUNTS, SESSION_COOKIE_NAME } from "./support/constants";
import { adminApi } from "./support/roles";
import { mintSessionToken } from "./support/session-token";

/**
 * Sessão expirada (#207): o 401 de uma chamada de API leva ao login com o
 * aviso e a rota em `next`; depois do login a pessoa volta à ficha e o SOAP
 * que não foi salvo reaparece. Login real (sessão própria, nunca a da suíte).
 */
test.use({
  storageState: { cookies: [], origins: [] },
  // Login tem limite de 5/min por IP: balde próprio (RFC 5737), sem disputar o
  // do loopback com `auth.spec.ts` (mesma técnica do global-setup).
  extraHTTPHeaders: { "x-forwarded-for": "198.51.100.207" },
});

const ACCOUNT = ROLE_ACCOUNTS.company_admin.email;

const signIn = async (page: Page): Promise<void> => {
  await page.getByLabel("Email", { exact: true }).fill(ACCOUNT);
  await page.getByLabel("Senha", { exact: true }).fill(E2E_ROLE_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
};

/** Troca o cookie por um da mesma conta já vencido — o que o navegador teria às 12h01. */
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

test("SOAP salvo com a sessão vencida volta depois do login, na mesma ficha", async ({ page }) => {
  const api = await adminApi();
  const patient = await createPatient(api);
  await api.dispose();
  const record = `/pacientes/${patient.id}?aba=evolucoes`;

  await page.goto(record);
  // Sem cookie: o proxy manda ao login guardando a rota, sem aviso de expiração.
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(record)}`);
  await expect(page.getByText("Sua sessão expirou")).toHaveCount(0);
  await signIn(page);
  await expect(page).toHaveURL(record);

  await page.getByRole("button", { name: "+ Nova evolução" }).click();
  await page.getByLabel(/S — Subjetivo/).fill("Dor 7/10, exsudato seroso");
  await expireSession(page);
  await page.getByRole("button", { name: "Registrar evolução" }).click();

  await expect(page).toHaveURL(`/login?error=session_expired&next=${encodeURIComponent(record)}`);
  await expect(page.getByText("Sua sessão expirou. Entre novamente.")).toBeVisible();

  await signIn(page);
  await expect(page).toHaveURL(record);
  await expect(page.getByText(/Recuperamos o texto que não foi salvo/)).toBeVisible();
  await expect(page.getByLabel(/S — Subjetivo/)).toHaveValue("Dor 7/10, exsudato seroso");

  await page.getByRole("button", { name: "Registrar evolução" }).click();
  await expectToast(page, "Evolução registrada");
  // Lista da ficha: o SOAP registrado aparece como evolução (o campo já fechou).
  await expect(page.getByRole("listitem").getByText("Dor 7/10, exsudato seroso")).toBeVisible();
});

test("página aberta com cookie vencido vai ao login com o aviso e o caminho de volta", async ({ page }) => {
  await expireSession(page);

  await page.goto("/agenda");

  await expect(page).toHaveURL("/login?error=session_expired&next=%2Fagenda");
  await expect(page.getByText("Sua sessão expirou. Entre novamente.")).toBeVisible();
});
