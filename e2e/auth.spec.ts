import { test, expect } from "@playwright/test";
import { E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD, OPEN_MODE_BASE_URL } from "./support/constants";
import { sessionCookie } from "./support/session-token";
import { nextTotpCode } from "./support/totp";

// Sobrescreve o storageState admin padrão (playwright.config.ts) — estes specs
// precisam começar deslogados para exercitar o próprio fluxo de login.
test.use({ storageState: { cookies: [], origins: [] } });

const signIn = async (
  page: import("@playwright/test").Page,
  email: string,
  password: string,
): Promise<void> => {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

test.describe("login por e-mail e senha", () => {
  test("redireciona para /login quando não autenticado", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login/);
  });

  test("não oferece mais login com Google", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.getByText("Entrar com Google")).toHaveCount(0);
  });

  test("mostra erro com senha incorreta", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, E2E_SUPER_ADMIN_EMAIL, "senha-totalmente-errada");
    await expect(page.getByText("Email ou senha incorretos")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  // Super Admin é o operador da plataforma (ADR-007) e entra com senha + código
  // do autenticador cadastrado no global-setup (ADR-008).
  test("Super Admin entra e termina em /plataforma", async ({ page }) => {
    await page.goto("/login");
    await signIn(page, E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD);
    await page.getByLabel("Código do autenticador", { exact: true }).fill(await nextTotpCode());
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plataforma" })).toBeVisible();
    await expect(page).toHaveURL("/plataforma");
    // Só a navegação da plataforma (C4, #267) — nunca a sidebar da equipe.
    await expect(page.getByRole("navigation").getByRole("link")).toHaveText(["Clínicas", "Auditoria", "Taxonomia", "Minha conta"]);
  });

  test("sai da sessão e volta para o login", async ({ page, context }) => {
    // Sessão própria, nunca a da suíte: logout revoga TODAS as sessões
    // da conta (#194), inclusive o storageState que os demais specs usam em
    // paralelo. A revogação em si é provada em tests/api/session-revocation.
    await context.addCookies([sessionCookie("logout-e2e@vitta.test", "company_admin")]);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);

    // Sessão realmente encerrada — voltar para uma rota protegida reabre o login.
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login/);
  });

  test("oferece o fluxo de recuperação de senha sem revelar se a conta existe", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha/);

    await page.getByLabel("E-mail", { exact: true }).fill("nao-existe@vitta.test");
    await page.getByRole("button", { name: "Enviar link" }).click();

    await expect(
      page.getByText("Se houver uma conta com este e-mail, enviamos um link para redefinir a senha."),
    ).toBeVisible();
  });

  test("copy do login não presume acesso exclusivo de equipe (#68)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Entre com seu e-mail e sua senha")).toBeVisible();
    await expect(page.getByText("restrito à equipe", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Acesso restrito", { exact: false })).toHaveCount(0);
  });

  // SPEC_DEVIATION: os dois testes abaixo estabelecem a sessão de
  // paciente/parceiro via cookie assinado (sessionCookie), não pelo
  // formulário real de /login com email+senha.
  // Reason: /api/accounts (criação de conta) não devolve o link de convite na
  // resposta — só a rota de bootstrap do Super Admin devolve, e só em
  // dry-run. Fora do bootstrap, o link só existe no e-mail (ou no log do
  // gateway nulo em dev), inacessível a este processo de teste por design
  // (a rota é deliberadamente silenciosa quanto a revelar links — mesma
  // razão de projeto por trás da resposta neutra de /api/auth/forgot-password).
  // Não há hoje um caminho de teste que percorra o formulário real de senha
  // para paciente/parceiro sem violar esse design; os specs de portal já
  // existentes (portal-paciente.spec.ts, portal-parceiro.spec.ts) seguem o
  // mesmo precedente. O que este teste prova (AC2: redirecionamento pós-login
  // para /portal sem mensagem de acesso negado) permanece válido — a
  // diferença é só como a sessão nasce.
  test("paciente com sessão válida acessando a raiz é redirecionado ao portal, sem mensagem de acesso negado (#68)", async ({
    page,
    context,
  }) => {
    await context.addCookies([sessionCookie("paciente-e2e-login@vitta.test", "patient")]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByText("restrito à equipe", { exact: false })).toHaveCount(0);
  });

  test("parceiro com sessão válida acessando a raiz é redirecionado ao portal, sem mensagem de acesso negado (#68)", async ({
    page,
    context,
  }) => {
    await context.addCookies([sessionCookie("parceiro-e2e-login@vitta.test", "partner")]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/portal/);
    await expect(page.getByText("restrito à equipe", { exact: false })).toHaveCount(0);
  });
});

test.describe("modo aberto (AUTH_SECRET não configurado)", () => {
  // Servidor isolado na porta 3100 (ver playwright.config.ts) — sem auth configurada,
  // o proxy deixa passar direto (comportamento só permitido fora de produção).
  test.use({ baseURL: OPEN_MODE_BASE_URL, storageState: { cookies: [], origins: [] } });

  test("acessa o dashboard sem login quando a autenticação não está configurada", async ({
    page,
  }) => {
    await page.goto("/");
    // timeout maior — primeiro acesso ao servidor "modo aberto" (porta isolada,
    // distDir isolado) ainda pode estar compilando a rota/terminando a migração pglite.
    //
    // Repositórios clínicos cifrados exigem AUTH_SECRET incondicionalmente (fail-closed
    // por design — não dá pra cifrar PHI sem chave), então widgets que dependem de dados
    // (ex.: /api/summary) mostram erro em vez de carregar; a página degrada mostrando o
    // alerta em vez do heading "Dashboard" (ver `if (error) return <ErrorAlert .../>` em
    // src/app/(staff)/page.tsx). O que este teste prova é o bypass de sessão (sidebar/nav
    // renderiza sem redirecionar para /login), não que dados clínicos carreguem sem chave.
    await expect(page.getByRole("navigation")).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("acessa a agenda diretamente, sem redirecionar para /login", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page.getByRole("heading", { name: "Agenda" })).toBeVisible();
  });
});
