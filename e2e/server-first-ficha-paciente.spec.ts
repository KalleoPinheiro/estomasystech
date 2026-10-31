import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { addAssessment, apiPut, createCarePlan, createCondition, createPatient } from "./support/api";
import { type UserRole, sessionCookie } from "./support/session-token";

/**
 * #552, ficha do paciente no servidor (ADR-069, ADR-080): a carga não chama `/api`, o prontuário
 * (paciente, anamnese, condições, planos) já vem no HTML, a página não salta (CLS < 0,05) e o LCP
 * no celular (CPU 4x, 1,6 Mbps) fica em até 2,5 s. A massa é por projeto e idempotente: prod e dev
 * dividem o banco do gate.
 */
const CLS_LIMIT = 0.05;
const LCP_LIMIT_MS = 2500;
const WIDTHS = [360, 390, 768, 1280];
const PHONE_SLOW = { latency: 150, down: 1_600_000 / 8, up: 750_000 / 8 };

async function measure(page: Page) {
  await page.addInitScript(() => {
    const box = { cls: 0, lcp: 0 };
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
  });
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    const type = request.resourceType();
    const url = new URL(request.url());
    if ((type === "fetch" || type === "xhr") && url.pathname.startsWith("/api/")) {
      apiCalls.push(`${request.method()} ${url.pathname}${url.search}`);
    }
  });
  return {
    apiCalls,
    metrics: () => page.evaluate(() => (window as unknown as { __m: { cls: number; lcp: number } }).__m),
  };
}

async function signIn(context: BrowserContext, role: UserRole) {
  await context.addCookies([sessionCookie(`server-first-552-${role}@estomasystech.test`, role)]);
}

test.describe("Ficha do paciente no servidor", () => {
  const ADMIN = sessionCookie("local", "company_admin");
  let patientId = "";
  let patientName = "";

  test.beforeAll(async ({ browser }, testInfo) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await context.addCookies([ADMIN]);
    patientName = `Ficha Server First ${testInfo.project.name}`;
    const found = await page.request.get(`/api/patients?search=${encodeURIComponent(patientName)}&limit=5`);
    const existing = ((await found.json()) as { data: { id: string }[] | null }).data?.[0];
    if (existing) {
      patientId = existing.id;
    } else {
      const patient = await createPatient(page.request, { fullName: patientName });
      patientId = patient.id;
      await apiPut(page.request, `/api/patients/${patient.id}/anamnesis`, { allergies: "Látex" });
      const condition = await createCondition(page.request, patient.id, {
        kind: "wound",
        title: "Úlcera venosa server first",
      });
      for (let i = 0; i < 3; i++) await addAssessment(page.request, condition.id, { lengthMm: 20 - i, widthMm: 10, depthMm: 2 });
      await createCarePlan(page.request, patient.id, { conditionId: condition.id });
    }
    await context.close();
  });

  test.use({ storageState: { cookies: [], origins: [] } });

  for (const width of WIDTHS) {
    test(`/pacientes/[id] em ${width}px: sem /api na carga, com o prontuário pronto e sem salto`, async ({ page }) => {
      await page.context().addCookies([ADMIN]);
      await page.setViewportSize({ width, height: 800 });
      const { apiCalls, metrics } = await measure(page);

      await page.goto(`/pacientes/${patientId}`);
      await expect(page.getByRole("heading", { level: 1, name: patientName })).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: "Alergias: Látex" })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
      expect((await metrics()).cls, "CLS da ficha").toBeLessThan(CLS_LIMIT);
    });
  }

  test("o HTML que o servidor entrega já traz o paciente e a anamnese (dados prontos junto do primeiro paint)", async ({ page }) => {
    await page.context().addCookies([ADMIN]);

    const html = await (await page.request.get(`/pacientes/${patientId}`)).text();

    expect(html).toContain(patientName);
    expect(html).toContain("Látex");
  });

  test("trocar de aba não chama /api nem relê o servidor, e a URL acompanha", async ({ page }) => {
    await page.context().addCookies([ADMIN]);
    await page.setViewportSize({ width: 1280, height: 800 });
    const { apiCalls } = await measure(page);
    await page.goto(`/pacientes/${patientId}`);
    await expect(page.getByRole("heading", { level: 1, name: patientName })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(`/pacientes/${patientId}`)) documents.push(request.url());
    });

    await page.getByRole("tab", { name: /Estomias e feridas/ }).click();

    await expect(page.getByText("Úlcera venosa server first")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/pacientes/${patientId}\\?aba=condicoes$`));
    expect(apiCalls, "chamadas /api ao trocar de aba").toEqual([]);
    expect(documents, "releituras do servidor ao trocar de aba").toEqual([]);
  });

  test("a recepção abre a ficha sem as seções clínicas e sem chamada /api", async ({ page }) => {
    await signIn(page.context(), "atendente");
    await page.setViewportSize({ width: 360, height: 800 });
    const { apiCalls } = await measure(page);

    await page.goto(`/pacientes/${patientId}`);

    await expect(page.getByText(/seções clínicas do prontuário são restritas/)).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(apiCalls, "chamadas /api na carga").toEqual([]);
  });

  test("o Profissional sem vínculo recebe 404 na ficha (R4)", async ({ page }) => {
    await signIn(page.context(), "profissional");

    await page.goto(`/pacientes/${patientId}`);

    // A resposta já começou a fluir (loading.tsx) quando o servidor decide: o 404 chega como página «não encontrada».
    await expect(page.getByRole("heading", { name: patientName })).toHaveCount(0);
    await expect(page.getByText(/não encontrad/i).first()).toBeVisible();
  });

  test("a ficha no celular entrega o LCP em até 2,5 s (CPU 4x, 1,6 Mbps)", async ({ page }) => {
    await page.context().addCookies([ADMIN]);
    await page.setViewportSize({ width: 360, height: 740 });
    const { metrics } = await measure(page);
    await page.goto(`/pacientes/${patientId}`);
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
    const lcps: number[] = [];
    let cls = 0;
    for (let i = 0; i < 5; i++) {
      await page.goto(`/pacientes/${patientId}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const m = await metrics();
      lcps.push(m.lcp);
      cls = Math.max(cls, m.cls);
    }
    const median = [...lcps].sort((a, b) => a - b)[Math.floor(lcps.length / 2)] as number;

    expect(median, "LCP da ficha").toBeLessThanOrEqual(LCP_LIMIT_MS);
    expect(cls, "CLS da ficha com CPU 4x").toBeLessThan(CLS_LIMIT);
  });
});
