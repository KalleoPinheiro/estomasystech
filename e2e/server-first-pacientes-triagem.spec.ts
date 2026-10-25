import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { createCondition, createPatient, linkPortalAccount, unique } from "./support/api";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #549, lista de pacientes e triagem no servidor (ADR-069): a carga não chama `/api` (nem a casca
 * do Profissional, que antes buscava a fila de triagem para o selo da barra do celular), a página
 * não salta (CLS < 0,05) com mais de 100 pacientes e fila de triagem com fotos, e a triagem não
 * trava a thread (o tempo bloqueado por long tasks da triagem, que era 277 ms, não passa do piso do casco).
 */
const CLS_LIMIT = 0.05;
const LCP_LIMIT_MS = 2500;
/** Decisão de PO: a triagem pode passar do piso do casco em até 10%. */
const BLOCKING_MARGIN = 1.1;
/** Resolução da medida: a variação entre duas cargas idênticas do casco chega a ~25 ms com CPU 4x. */
const BLOCKING_NOISE_MS = 25;
const PAGE_SIZE = 100;
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const WIDTHS = [360, 390, 768, 1280];
const PHONE_SLOW = { latency: 150, down: 1_600_000 / 8, up: 750_000 / 8 };

async function measure(page: Page) {
  await page.addInitScript(() => {
    const box = { cls: 0, lcp: 0, longTask: 0, blocking: 0 };
    (window as unknown as { __m: typeof box }).__m = box;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) box.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) box.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        box.longTask = Math.max(box.longTask, entry.duration);
        // Tempo bloqueado: o que passa de 50 ms em cada long task (a mesma conta da linha de base).
        box.blocking += Math.max(0, entry.duration - 50);
      }
    }).observe({ type: "longtask", buffered: true });
  });
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    const type = request.resourceType();
    if ((type === "fetch" || type === "xhr") && new URL(request.url()).pathname.startsWith("/api/")) {
      apiCalls.push(`${request.method()} ${new URL(request.url()).pathname}${new URL(request.url()).search}`);
    }
  });
  return {
    apiCalls,
    metrics: () =>
      page.evaluate(() => (window as unknown as { __m: { cls: number; lcp: number; longTask: number; blocking: number } }).__m),
  };
}

async function signIn(context: BrowserContext, role: UserRole) {
  await context.addCookies([sessionCookie(`server-first-549-${role}@estomasystech.test`, role)]);
}

test.describe("Pacientes e triagem no servidor", () => {
  const ADMIN = sessionCookie("local", "company_admin");

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.addCookies([ADMIN]);
    // Mais de uma página de pacientes: a lista cobre o «Carregar mais» e a altura real da tabela.
    const tag = unique();
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      await createPatient(page.request, { fullName: `Zz Server First ${tag} ${String(i).padStart(3, "0")}` });
    }
    // Fila de triagem com três fotos de pacientes reais do portal.
    for (let i = 0; i < 3; i++) {
      await context.clearCookies();
      await context.addCookies([ADMIN]);
      const patient = await createPatient(page.request, { fullName: `Zz Server First Foto ${unique()}` });
      await linkPortalAccount(page.request, "patient", patient);
      const condition = await createCondition(page.request, patient.id, {
        kind: "wound",
        title: `Ferida Server First ${unique()}`,
      });
      await context.addCookies([sessionCookie(patient.email, "patient")]);
      await page.request.post("/api/portal/patient/consent?purpose=image");
      await page.request.post("/api/portal/patient/photos", {
        multipart: {
          file: { name: "foto.png", mimeType: "image/png", buffer: TINY_PNG },
          conditionId: condition.id,
          note: "para a triagem",
        },
      });
    }
    await context.close();
  });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of WIDTHS) {
    test(`/pacientes em ${width}px: sem /api na carga, com a lista pronta e sem salto`, async ({ page }) => {
      await signIn(page.context(), "company_admin");
      await page.context().addCookies([ADMIN]);
      await page.setViewportSize({ width, height: 800 });
      const { apiCalls, metrics } = await measure(page);

      await page.goto("/pacientes");
      await expect(page.getByRole("heading", { level: 1, name: "Pacientes" })).toBeVisible();
      await expect(page.getByRole("row").nth(1)).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
      expect((await metrics()).cls, "CLS de /pacientes").toBeLessThan(CLS_LIMIT);
    });

    test(`/triagem em ${width}px: sem /api na carga, com a fila pronta e sem salto`, async ({ page }) => {
      await page.context().addCookies([ADMIN]);
      await page.setViewportSize({ width, height: 800 });
      const { apiCalls, metrics } = await measure(page);

      await page.goto("/triagem");
      await expect(page.getByRole("heading", { level: 1, name: "Triagem de fotos" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Ampliar foto de/ }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
      expect((await metrics()).cls, "CLS de /triagem").toBeLessThan(CLS_LIMIT);
    });
  }

  for (const role of ["profissional", "atendente"] as const) {
    test(`a casca do ${role} no celular não chama /api (selo da triagem vem do servidor)`, async ({ page }) => {
      await signIn(page.context(), role);
      await page.setViewportSize({ width: 360, height: 800 });
      const { apiCalls } = await measure(page);

      await page.goto("/pacientes");
      await expect(page.getByRole("heading", { level: 1, name: "Pacientes" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Atalhos" })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
    });
  }

  test("o HTML que o servidor entrega já traz a lista de pacientes e a fila de triagem (dados prontos junto do primeiro paint)", async ({ page }) => {
    await page.context().addCookies([ADMIN]);

    const pacientes = await (await page.request.get("/pacientes")).text();
    const triagem = await (await page.request.get("/triagem")).text();

    expect(pacientes).toContain("Prontuário");
    expect(pacientes).toMatch(/Zz S\. F\./);
    expect(triagem).toContain("Ampliar foto de");
    expect(triagem).not.toContain("Carregando…");
  });

  test("o «Carregar mais» e a busca digitada seguem pela API", async ({ page }) => {
    await page.context().addCookies([ADMIN]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/pacientes");
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    const rowsBefore = await page.getByRole("row").count();

    await page.getByText("Carregar mais").click();
    await expect.poll(async () => page.getByRole("row").count()).toBeGreaterThan(rowsBefore);

    const search = page.waitForResponse((r) => r.url().includes("/api/patients?search=Server%20First%20Foto"));
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill("Server First Foto");
    await search;
    // A busca troca a lista do servidor pelas três da foto (nomes abreviados: «Zz S. F. F. …»).
    await expect(page.getByText(/^Zz S\. F\. F\. /)).toHaveCount(3);
  });

  test("a triagem no celular entrega a página em até 2,5 s e não bloqueia a thread mais que o casco da equipe (CPU 4x, 1,6 Mbps)", async ({
    page,
  }) => {
    await page.context().addCookies([ADMIN]);
    await page.setViewportSize({ width: 360, height: 740 });
    const { metrics } = await measure(page);
    await page.goto("/triagem");
    await page.waitForLoadState("networkidle");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: PHONE_SLOW.latency,
      downloadThroughput: PHONE_SLOW.down,
      uploadThroughput: PHONE_SLOW.up,
    });
    // Cargas alternadas entre as duas telas; o tempo bloqueado é o piso (mínimo) de cinco, o LCP a mediana: o ruído da máquina (e de outros testes
    // em paralelo) pega as duas igualmente, e um long task isolado de 50 ms não muda a conta.
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;
    const floor = (values: number[]) => Math.min(...values);
    const samples: Record<string, { blocking: number; lcp: number }[]> = { "/triagem": [], "/mais": [] };
    for (let i = 0; i < 5; i++) {
      for (const path of ["/triagem", "/mais"]) {
        await page.goto(path, { waitUntil: "load" });
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        (samples[path] as { blocking: number; lcp: number }[]).push(await metrics());
      }
    }
    const summarize = (path: string) => {
      const list = samples[path] as { blocking: number; lcp: number }[];
      return { blocking: floor(list.map((x) => x.blocking)), lcp: median(list.map((x) => x.lcp)) };
    };
    const triagem = summarize("/triagem");
    const shell = summarize("/mais");

    expect(triagem.lcp, "LCP de /triagem").toBeLessThanOrEqual(LCP_LIMIT_MS);
    // O tempo bloqueado é a hidratação do casco (a «/mais», sem lista, mede o mesmo): a página não pode acrescentar a ele.
    expect(
      triagem.blocking,
      `tempo bloqueado por long tasks em /triagem (${Math.round(triagem.blocking)} ms) contra o piso do casco (/mais: ${Math.round(shell.blocking)} ms)`,
    ).toBeLessThanOrEqual(shell.blocking * BLOCKING_MARGIN + BLOCKING_NOISE_MS);
  });
});
