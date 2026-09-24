import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  addAssessment,
  apiPost,
  completeAppointment,
  createAppointment,
  createCarePlan,
  createCondition,
  createFollowUp,
  createInvoice,
  createPartner,
  createPatient,
  createProcedure,
  createProfessional,
  createSupply,
  unique,
} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { sessionCookie } from "./support/session-token";

/**
 * Layout mobile-first (.specs/features/layout-mobile-first/checks.md): prova o
 * arranjo real de todas as páginas atuais em 390x844 (celular) e 1440x900
 * (desktop). Cada teste mede caixas no navegador — classe CSS não prova layout.
 */

const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
const MIN_TOUCH_PX = 44;

interface World {
  patientId: string;
  patientEmail: string;
  partnerEmail: string;
  conditionId: string;
  appointmentId: string;
  carePlanId: string;
}

let worldPromise: Promise<World> | null = null;

/** Um mundo só por worker: as páginas precisam de dado, não de dado novo por teste. */
function world(request: APIRequestContext): Promise<World> {
  worldPromise ??= seedWorld(request);
  return worldPromise;
}

async function seedWorld(request: APIRequestContext): Promise<World> {
  const partner = await createPartner(request, { fullName: `Dr. Parceiro Layout ${unique()}` });
  const professional = await createProfessional(request, { fullName: `Enf. Layout ${unique()}` });
  await createProcedure(request, { name: `Curativo layout ${unique()}` });
  await createSupply(request, { name: `Placa hidrocoloide ${unique()}` });
  const patient = await createPatient(request, {
    fullName: `Maria Aparecida Layout ${unique()}`,
    referredByPartnerId: partner.id,
  });
  const condition = await createCondition(request, patient.id, {
    kind: "wound",
    title: `Lesão por pressão sacral ${unique()}`,
  });
  await addAssessment(request, condition.id, { lengthMm: 32, widthMm: 21, depthMm: 4 });
  await addAssessment(request, condition.id, { lengthMm: 25, widthMm: 17, depthMm: 2 });
  const slot = slotForAttempt("layout-mobile-first-world", 30);
  const appointment = await createAppointment(request, {
    patientId: patient.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    procedure: "Troca de curativo",
    priceCents: 15000,
    professionalId: professional.id,
  });
  await completeAppointment(request, appointment.id);
  await createFollowUp(request, {
    patientId: patient.id,
    dueDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    reason: "Reavaliar cicatrização da lesão sacral",
  });
  await createInvoice(request, {
    patientId: patient.id,
    description: "Sessão de curativo",
    amountCents: 15000,
  });
  const plan = await createCarePlan(request, patient.id, { conditionId: condition.id });
  await apiPost(request, `/api/care-plans/${plan.id}/outcomes`, {
    outcomeCode: "1101",
    baselineScore: 2,
    targetScore: 4,
  });
  return {
    patientId: patient.id,
    patientEmail: patient.email,
    partnerEmail: partner.email,
    conditionId: condition.id,
    appointmentId: appointment.id,
    carePlanId: plan.id,
  };
}

type Audience = "staff" | "patient" | "partner" | "public";

interface PageSpec {
  name: string;
  audience: Audience;
  url: (w: World) => string;
  /** Tela da equipe com `PageHeader`. */
  pageHeader?: boolean;
}

const PAGE_SET: PageSpec[] = [
  { name: "dashboard", audience: "staff", url: () => "/", pageHeader: true },
  { name: "agenda", audience: "staff", url: () => "/agenda", pageHeader: true },
  { name: "triagem", audience: "staff", url: () => "/triagem", pageHeader: true },
  { name: "pacientes", audience: "staff", url: () => "/pacientes", pageHeader: true },
  {
    name: "prontuário",
    audience: "staff",
    url: (w) => `/pacientes/${w.patientId}`,
    pageHeader: true,
  },
  { name: "parceiros", audience: "staff", url: () => "/parceiros", pageHeader: true },
  { name: "profissionais", audience: "staff", url: () => "/profissionais", pageHeader: true },
  { name: "procedimentos", audience: "staff", url: () => "/procedimentos", pageHeader: true },
  { name: "materiais", audience: "staff", url: () => "/materiais", pageHeader: true },
  { name: "faturamento", audience: "staff", url: () => "/faturamento", pageHeader: true },
  { name: "repasses", audience: "staff", url: () => "/repasses", pageHeader: true },
  { name: "relatórios", audience: "staff", url: () => "/relatorios", pageHeader: true },
  { name: "auditoria", audience: "staff", url: () => "/auditoria", pageHeader: true },
  { name: "configurações", audience: "staff", url: () => "/configuracoes", pageHeader: true },
  { name: "login", audience: "public", url: () => "/login" },
  { name: "esqueci-senha", audience: "public", url: () => "/esqueci-senha" },
  { name: "definir-senha", audience: "public", url: () => "/definir-senha?token=invalido" },
  { name: "portal do paciente", audience: "patient", url: () => "/portal" },
  { name: "portal do parceiro", audience: "partner", url: () => "/portal" },
  {
    name: "documento atestado",
    audience: "staff",
    url: (w) => `/documentos/atestado/${w.appointmentId}`,
  },
  {
    name: "documento consentimento",
    audience: "staff",
    url: (w) => `/documentos/consentimento/${w.patientId}`,
  },
  {
    name: "documento relatório",
    audience: "staff",
    url: (w) => `/documentos/relatorio/${w.conditionId}`,
  },
  {
    name: "documento plano de cuidados",
    audience: "staff",
    url: (w) => `/documentos/plano-cuidados/${w.carePlanId}`,
  },
];

/** Página no público certo: equipe herda a sessão do admin; portal e público não. */
async function openAs(
  browser: Browser,
  page: Page,
  spec: PageSpec,
  w: World,
): Promise<{ target: Page; context: BrowserContext | null }> {
  if (spec.audience === "staff") return { target: page, context: null };
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    timezoneId: "America/Sao_Paulo",
  });
  if (spec.audience === "patient") await context.addCookies([sessionCookie(w.patientEmail, "patient")]);
  if (spec.audience === "partner") await context.addCookies([sessionCookie(w.partnerEmail, "partner")]);
  return { target: await context.newPage(), context };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // Nenhum esqueleto de carregamento visível: a medida é da tela pronta.
  await expect(page.locator(".sv-skeleton:visible")).toHaveCount(0, { timeout: 20_000 });
}

async function scrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

async function tooSmallControls(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const root = document.querySelector("main") ?? document.body;
    return Array.from(
      root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"),
    )
      .filter((el) => el.checkVisibility({ visibilityProperty: true }))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name =
          el.getAttribute("aria-label") ??
          el.getAttribute("placeholder") ??
          (el.textContent ?? "").trim().slice(0, 40);
        return { name: `<${el.tagName.toLowerCase()}> ${name}`, w: r.width, h: r.height };
      })
      .filter((b) => b.w > 0 && b.h > 0 && (b.w < min || b.h < min))
      .map((b) => `${b.name} (${Math.round(b.w)}x${Math.round(b.h)})`);
  }, MIN_TOUCH_PX);
}


test.describe("página inteira", () => {
  for (const spec of PAGE_SET) {
    test(`sem scroll lateral: ${spec.name}`, async ({ page, browser, request }) => {
      const w = await world(request);
      const { target, context } = await openAs(browser, page, spec, w);
      for (const viewport of [MOBILE, DESKTOP]) {
        await target.setViewportSize(viewport);
        await target.goto(spec.url(w));
        await settle(target);
        expect(
          await scrollWidth(target),
          `scroll lateral em ${spec.name} ${viewport.width}x${viewport.height}`,
        ).toBeLessThanOrEqual(viewport.width + 2);
      }
      await context?.close();
    });

    test(`alvos de toque: ${spec.name}`, async ({ page, browser, request }) => {
      const w = await world(request);
      const { target, context } = await openAs(browser, page, spec, w);
      await target.setViewportSize(MOBILE);
      await target.goto(spec.url(w));
      await settle(target);
      expect(await tooSmallControls(target), `controles < 44px em ${spec.name}`).toEqual([]);
      await context?.close();
    });
  }

  for (const spec of PAGE_SET.filter((s) => s.pageHeader)) {
    test(`um h1 por página: ${spec.name}`, async ({ page, request }) => {
      const w = await world(request);
      await page.setViewportSize(DESKTOP);
      await page.goto(spec.url(w));
      await settle(page);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("[data-page-header] h1")).toHaveCount(1);
    });
  }
});

test.describe("casca e padrões compartilhados", () => {
  for (const [name, url] of [
    ["pacientes", "/pacientes"],
    ["agenda", "/agenda"],
    ["faturamento", "/faturamento"],
  ] as const) {
    test(`ações abaixo do título: ${name}`, async ({ page, request }) => {
      await world(request);
      await page.setViewportSize(MOBILE);
      await page.goto(url);
      await settle(page);
      const title = await page.locator("[data-page-header] h1").boundingBox();
      const actions = await page.locator("[data-page-header-actions]").boundingBox();
      expect(title).not.toBeNull();
      expect(actions).not.toBeNull();
      expect(actions!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
      expect(actions!.x + actions!.width).toBeLessThanOrEqual(MOBILE.width);
    });
  }

  test("e-mail da sidebar em uma linha", async ({ page, request }) => {
    await world(request);
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await settle(page);
    const email = page.locator("[data-sidebar-email]");
    await expect(email).toBeVisible();
    const metrics = await email.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        height: el.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(style.lineHeight),
        overflow: style.textOverflow,
        title: el.getAttribute("title"),
        text: el.textContent,
      };
    });
    expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 1.5);
    expect(metrics.overflow).toBe("ellipsis");
    expect(metrics.title).toBe(metrics.text);
  });

  for (const [name, url] of [
    ["dashboard", "/"],
    ["faturamento", "/faturamento"],
    ["relatórios", "/relatorios"],
  ] as const) {
    test(`KPIs em 2 colunas: ${name}`, async ({ page, request }) => {
      await world(request);
      await page.setViewportSize(MOBILE);
      await page.goto(url);
      await settle(page);
      const boxes = await page.locator("[data-kpi-grid] > *").evaluateAll((els) =>
        els.slice(0, 2).map((el) => {
          const r = el.getBoundingClientRect();
          return { top: Math.round(r.top), left: Math.round(r.left) };
        }),
      );
      expect(boxes).toHaveLength(2);
      expect(boxes[0].top).toBe(boxes[1].top);
      expect(boxes[0].left).not.toBe(boxes[1].left);
    });
  }

  test("voltar na mesma linha", async ({ page, request }) => {
    const w = await world(request);
    await page.setViewportSize(MOBILE);
    await page.goto(`/pacientes/${w.patientId}`);
    await settle(page);
    const back = page.locator("[data-page-header]").getByRole("link", { name: "Pacientes" });
    const centers = await back.evaluate((el) => {
      const icon = el.querySelector("svg")!.getBoundingClientRect();
      const range = document.createRange();
      const textNode = Array.from(el.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      )!;
      range.selectNodeContents(textNode);
      const text = range.getBoundingClientRect();
      return { icon: icon.top + icon.height / 2, text: text.top + text.height / 2 };
    });
    expect(Math.abs(centers.icon - centers.text)).toBeLessThanOrEqual(4);
  });
});
