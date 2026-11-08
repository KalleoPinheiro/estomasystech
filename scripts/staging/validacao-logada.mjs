// Validação logada (#668): percorre as telas de cada papel nas larguras 360, 390, 768 e 1280 contra um
// ambiente já no ar e grava capturas + resultados.json. NÃO corrige nada: cada achado vira issue com evidência.
// Fora do Actions (ADR-042). Uso e variáveis: docs/engineering/homologacao.md § 7.
import fs from "node:fs";
import { chromium } from "playwright";
import { avaliar } from "./validacao-logada-lib.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.env.OUT_DIR ?? "qa-validacao-logada";
const PASSWORD = process.env.STAGING_SEED_PASSWORD ?? "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";
// Pausa entre telas: contra a staging (120 req/min por IP em /api/*), use ~2000 para não gerar 429.
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 0);
const ROLES = {
  admin: "admin@homologacao.invalid",
  atendente: "atendente@homologacao.invalid",
  profissional: "profissional@homologacao.invalid",
};
const WIDTHS = [360, 390, 768, 1280];
const ADMIN_EXTRA = [
  "/configuracoes/identidade",
  "/configuracoes/horarios",
  "/configuracoes/feriados",
  "/configuracoes/contas",
  "/configuracoes/privacidade",
  "/configuracoes/dados",
  "/configuracoes/email",
  "/auditoria",
];

if (!PASSWORD) {
  console.error("STAGING_SEED_PASSWORD obrigatória (senha das contas fictícias).");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
// O cabeçalho atravessa o SSO da Vercel; o cookie que ele devolve vale para as navegações seguintes.
const extraHTTPHeaders = BYPASS
  ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" }
  : undefined;
const pause = () => (PAUSE_MS ? new Promise((resolve) => setTimeout(resolve, PAUSE_MS)) : undefined);

async function login(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation").filter({ has: page.getByRole("link", { name: "Agenda" }) });
  const hrefs = await nav.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  const state = await context.storageState();
  await context.close();
  return { state, routes: [...new Set(hrefs.filter((href) => href.startsWith("/")))] };
}

async function visit(page, route, problems, apiFail) {
  let status = null;
  try {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "load" });
    status = response?.status() ?? null;
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  } catch (error) {
    problems.push(`[goto] ${error.message}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const h1 = await page.locator("h1").first().innerText().catch(() => "");
  return { status, overflow, h1, final: new URL(page.url()).pathname, problems: [...problems], apiFail: [...apiFail] };
}

function watch(page, problems, apiFail) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      problems.push(`[console.${m.type()}] ${m.text()} (${m.location().url})`);
    }
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/") && r.status() >= 400) {
      apiFail.push(`${r.request().method()} ${url.pathname} ${r.status()}`);
    }
  });
  return page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error(`CSP ${e.violatedDirective} bloqueou ${e.blockedURI || "inline"}`),
    ),
  );
}

const results = [];
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const [role, email] of Object.entries(ROLES)) {
  const { state, routes: menu } = await login(browser, email);
  const routes = role === "admin" ? [...new Set([...menu, ...ADMIN_EXTRA])] : menu;
  console.log(`${role}: ${routes.length} rotas`);
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width >= 768 ? 900 : 780 },
      storageState: state,
      extraHTTPHeaders,
    });
    const page = await context.newPage();
    const problems = [];
    const apiFail = [];
    await watch(page, problems, apiFail);
    for (const route of routes) {
      problems.length = 0;
      apiFail.length = 0;
      const found = await visit(page, route, problems, apiFail);
      const slug = route === "/" ? "inicio" : route.replace(/^\//, "").replaceAll("/", "-");
      await page.screenshot({ path: `${OUT}/${role}-${width}-${slug}.png` });
      results.push({ role, width, route, ...found });
      await pause();
    }
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/resultados.json`, JSON.stringify(results, null, 1));
const { bad, erros } = avaliar(results, Object.keys(ROLES));
console.log(`total ${results.length} páginas, ${bad.length} com achado`);
for (const e of erros) console.log(`ERRO: ${e}`);
for (const b of bad) console.log(JSON.stringify(b));
process.exit(bad.length || erros.length ? 1 : 0);
