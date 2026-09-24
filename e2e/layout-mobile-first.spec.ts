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
  apiGet,
  apiPatch,
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

/**
 * Largura útil esperada da coluna de conteúdo, calculada sem depender dela:
 * viewport − sidebar fixa (rail do desktop; no celular a sidebar é drawer e não
 * ocupa a linha) − padding horizontal de `main`. Se o wrapper encolher até o
 * conteúdo, `main` encolhe junto e esta referência não — a prova falha.
 */
async function contentWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement;
    const style = getComputedStyle(main);
    const aside = document.querySelector("aside");
    const rail =
      aside && aside.checkVisibility() && getComputedStyle(aside).position !== "fixed"
        ? aside.getBoundingClientRect().width
        : 0;
    return (
      document.documentElement.clientWidth -
      rail -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight)
    );
  });
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
        // Checkbox/radio: o alvo de toque é o rótulo que o envolve (C8, renegociado).
        const isToggle = el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type);
        const r = (isToggle ? (el.closest("label") ?? el) : el).getBoundingClientRect();
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
      const layout = await page.locator("[data-kpi-grid]").evaluate((grid) => {
        const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
        const half = (grid.getBoundingClientRect().width - gap) / 2;
        const cards = Array.from(grid.children).map((el) => el.getBoundingClientRect());
        return { half, widths: cards.map((r) => r.width), tops: cards.map((r) => r.top) };
      });
      // Duas colunas exatas: cada card ocupa metade da grade (4 colunas dariam 1/4,
      // 1 coluna daria a largura toda), e os dois primeiros dividem a linha.
      expect(layout.widths.length).toBeGreaterThanOrEqual(2);
      for (const width of layout.widths) {
        expect(Math.abs(width - layout.half)).toBeLessThanOrEqual(2);
      }
      expect(layout.tops[0]).toBe(layout.tops[1]);
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

/** Consulta nova num dia futuro, com o paciente do mundo; devolve o dia e a hora. */
async function seedAgendaAppointment(request: APIRequestContext, seed: string) {
  const w = await world(request);
  const slot = slotForAttempt(seed, 30);
  await createAppointment(request, {
    patientId: w.patientId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    procedure: `Avaliação agenda ${unique()}`,
    priceCents: 10000,
  });
  return { slot, dayKey: slot.dateInput };
}

/** Avança a agenda até o mês de `dayKey` (YYYY-MM-DD). */
async function agendaToMonth(page: Page, dayKey: string): Promise<void> {
  const [year, month] = dayKey.split("-").map(Number);
  const now = new Date();
  const delta = (year - now.getFullYear()) * 12 + (month - 1 - now.getMonth());
  for (let i = 0; i < delta; i += 1) {
    await page.getByRole("button", { name: "Próximo mês" }).click();
  }
}

function todayKeySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * Fatura paga, para o recibo. O comprovante de repasse não entra aqui: fechar um
 * repasse exige mês encerrado e a API recusa consulta no passado — ele é provado
 * pela estrutura em `tests/pages/documento-repasse.test.tsx` e divide o
 * `DocumentFrame` com o recibo medido aqui.
 */
async function seedReceipt(request: APIRequestContext) {
  const professional = await apiPost<{ id: string }>(request, "/api/professionals", {
    fullName: `Enf. Comprovante ${unique()}`,
    registry: "COREN-SP 2",
    commissionType: "percentage",
    commissionPct: 30,
  });
  const patient = await createPatient(request, { fullName: `Paciente Recibo ${unique()}` });
  const slot = slotForAttempt("layout-documentos-recibo", 30);
  const appointment = await createAppointment(request, {
    patientId: patient.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    procedure: `Curativo recibo ${unique()}`,
    priceCents: 18000,
    professionalId: professional.id,
  });
  await completeAppointment(request, appointment.id);
  const invoices = await apiGet<Array<{ id: string; patientId: string }>>(
    request,
    `/api/invoices?patientId=${patient.id}`,
  );
  const invoice = invoices.find((i) => i.patientId === patient.id)!;
  const paid = await apiPatch<{ id: string; payments: Array<{ id: string }> }>(
    request,
    `/api/invoices/${invoice.id}`,
    { action: "pay", method: "pix" },
  );
  return { receiptUrl: `/documentos/recibo/${paid.id}/${paid.payments[0].id}` };
}

/**
 * Comprovante de repasse: fechar um repasse de verdade exige mês encerrado, e a
 * API recusa consulta no passado. A página busca o comprovante pela API no
 * navegador, então o teste responde essa chamada com um repasse fixo e mede o
 * documento renderizado de verdade.
 */
async function mockPayoutReceipt(page: Page): Promise<string> {
  const payout = {
    id: "po-layout",
    professionalId: "pr-layout",
    professionalName: "Enf. Layout Repasse",
    period: "2026-08",
    totalCents: 4000,
    paidAt: "2026-09-05T12:00:00.000Z",
    paymentMethod: "pix",
    notes: null,
    createdBy: "admin@clinica.com",
    createdAt: "2026-09-05T12:00:00.000Z",
    rule: { kind: "percentage", pct: 40 },
    status: "active",
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    items: [
      {
        appointmentId: "a1",
        kind: "session",
        procedure: "Troca de curativo com cobertura de prata",
        sessionDate: "2026-08-10T12:00:00.000Z",
        baseCents: 25000,
        commissionCents: 10000,
      },
    ],
  };
  await page.route("**/api/commission-payouts/po-layout", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { payout, professional: { fullName: "Enf. Layout Repasse", registry: "COREN-SP 3" } },
        error: null,
      },
    }),
  );
  return "/documentos/repasse/po-layout";
}

test.describe("agenda", () => {
  test("agenda: 7 colunas no celular", async ({ page, request }) => {
    await world(request);
    await page.setViewportSize(MOBILE);
    await page.goto("/agenda");
    await settle(page);
    const boxes = await page.locator("[data-mobile-month] [data-day]").evaluateAll((els) =>
      els.slice(0, 7).map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, w: r.width, h: r.height };
      }),
    );
    expect(boxes).toHaveLength(7);
    expect(new Set(boxes.map((b) => Math.round(b.left))).size).toBe(7);
    for (const box of boxes) {
      expect(box.right).toBeLessThanOrEqual(MOBILE.width);
      expect(box.w).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect(box.h).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
    }
  });

  test("agenda: ponto no dia com consulta", async ({ page, request }) => {
    const { dayKey } = await seedAgendaAppointment(request, "layout-agenda-ponto");
    await page.setViewportSize(MOBILE);
    await page.goto("/agenda");
    await settle(page);
    await agendaToMonth(page, dayKey);
    const day = page.locator(`[data-mobile-month] [data-day="${dayKey}"]`);
    await expect(day).toHaveAttribute("data-has-appointments", "true");
    // Nenhum chip de consulta dentro da grade compacta — só número e ponto.
    await expect(day.locator("button")).toHaveCount(0);
    await expect(page.locator("[data-mobile-month] .min-w-\\[840px\\]")).toHaveCount(0);
    expect((await day.innerText()).trim()).toMatch(/^\d{1,2}$/);
  });

  test("agenda: lista do dia", async ({ page, request }) => {
    const { dayKey, slot } = await seedAgendaAppointment(request, "layout-agenda-lista");
    await page.setViewportSize(MOBILE);
    await page.goto("/agenda");
    await settle(page);
    // A agenda abre no mês corrente com o dia de hoje selecionado.
    const today = todayKeySaoPaulo();
    await expect(page.locator(`[data-mobile-month] [data-day="${today}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await agendaToMonth(page, dayKey);
    await page.locator(`[data-mobile-month] [data-day="${dayKey}"]`).click();
    const list = page.locator("[data-day-list]");
    await expect(list.getByText(slot.startTimeInput)).toBeVisible();
    const w = await world(request);
    await expect(list.getByText(/Maria Aparecida Layout/).first()).toBeVisible();
    await expect(list.getByText(/Avaliação agenda/).first()).toBeVisible();
    await expect(list.getByText("Agendada").first()).toBeVisible();
    const listTop = (await list.boundingBox())!.y;
    const gridBottom = await page
      .locator("[data-mobile-month] [data-day]")
      .last()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    expect(listTop).toBeGreaterThanOrEqual(gridBottom);
    void w;
  });

  test("agenda: dia vazio", async ({ page, request }) => {
    await world(request);
    await page.setViewportSize(MOBILE);
    await page.goto("/agenda");
    await settle(page);
    // Um domingo do mês exibido: fora da grade padrão, sem consulta de seed.
    const sunday = page.locator("[data-mobile-month] [data-day]").nth(7);
    await sunday.click();
    await expect(page.locator("[data-day-list]").getByText("Nenhuma consulta neste dia.")).toBeVisible();
  });

  test("agenda: filtro em largura total", async ({ page, request }) => {
    await world(request);
    await page.setViewportSize(MOBILE);
    await page.goto("/agenda");
    await settle(page);
    const filter = await page.locator("[data-professional-filter]").boundingBox();
    const nav = await page.getByRole("button", { name: "Próximo mês" }).boundingBox();
    expect(filter!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
    expect(Math.abs(filter!.width - (await contentWidth(page)))).toBeLessThanOrEqual(2);
  });

  test("agenda: chips no desktop", async ({ page, request }) => {
    const { dayKey, slot } = await seedAgendaAppointment(request, "layout-agenda-chips");
    await page.setViewportSize(DESKTOP);
    await page.goto("/agenda");
    await settle(page);
    await agendaToMonth(page, dayKey);
    await expect(page.locator("[data-mobile-month]")).toHaveCount(0);
    const chip = page.getByRole("button", {
      name: new RegExp(`^${slot.startTimeInput} Maria Aparecida Layout`),
    });
    await expect(chip.first()).toBeVisible();
    // O chip mora dentro da célula do dia da consulta.
    await expect(page.locator(`[data-calendar-day="${dayKey}"]`).locator(chip)).toHaveCount(1);
  });
});

test.describe("telas com defeito específico", () => {
  test("prontuário: abas rolam dentro de si", async ({ page, request }) => {
    const w = await world(request);
    await page.setViewportSize(MOBILE);
    await page.goto(`/pacientes/${w.patientId}`);
    await settle(page);
    const tablist = page.getByRole("tablist", { name: "Seções do prontuário" });
    const overflow = await tablist.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(overflow.scroll).toBeGreaterThan(overflow.client);
    expect(await scrollWidth(page)).toBeLessThanOrEqual(MOBILE.width + 2);
    // Ao abrir, a aba ativa (Anamnese) está inteira dentro da tela.
    const active = await page.getByRole("tab", { name: "Anamnese" }).boundingBox();
    expect(active!.x).toBeGreaterThanOrEqual(0);
    expect(active!.x + active!.width).toBeLessThanOrEqual(MOBILE.width);
    await page.getByRole("tab", { name: "Pacotes" }).click();
    const tab = await page.getByRole("tab", { name: "Pacotes" }).boundingBox();
    expect(tab!.x).toBeGreaterThanOrEqual(0);
    expect(tab!.x + tab!.width).toBeLessThanOrEqual(MOBILE.width);
  });

  for (const viewport of [MOBILE, DESKTOP]) {
    test(`painéis na largura do conteúdo (${viewport.width})`, async ({ page, request }) => {
      const w = await world(request);
      await page.setViewportSize(viewport);
      for (const [url, panel] of [
        [`/pacientes/${w.patientId}`, "[role=tabpanel]"],
        ["/triagem", "[data-page-header] + *"],
      ] as const) {
        await page.goto(url);
        await settle(page);
        const box = await page.locator(panel).first().boundingBox();
        const width = await contentWidth(page);
        expect(Math.abs(box!.width - width), `${url} ${viewport.width}`).toBeLessThanOrEqual(2);
      }
    });
  }

  test("retornos pendentes sem esmagar", async ({ page, request }) => {
    await world(request);
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await settle(page);
    const rows = page.locator("[data-follow-up-row]");
    await expect(rows.first()).toBeVisible();
    const report = await rows.evaluateAll((els) =>
      els.map((row) => {
        const text = row.querySelector("[data-follow-up-text]")!;
        const actions = row.querySelector("[data-follow-up-actions]")!;
        const clipped = Array.from(text.querySelectorAll("*"))
          .concat(text)
          .some((el) => el.scrollWidth > el.clientWidth + 1);
        return {
          clipped,
          below:
            actions.getBoundingClientRect().top >= text.getBoundingClientRect().bottom - 1,
        };
      }),
    );
    for (const row of report) {
      expect(row.clipped).toBe(false);
      expect(row.below).toBe(true);
    }
  });

  test("telas públicas com margem", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.setViewportSize(MOBILE);
    for (const url of ["/login", "/esqueci-senha", "/definir-senha?token=invalido"]) {
      await page.goto(url);
      await settle(page);
      const card = await page.locator(".sv-gradient-border").boundingBox();
      expect(card!.x, url).toBeGreaterThanOrEqual(16);
      expect(MOBILE.width - (card!.x + card!.width), url).toBeGreaterThanOrEqual(16);
    }
    await context.close();
  });

  test("portal: confirmar não sobrepõe a data", async ({ browser, request }) => {
    const w = await world(request);
    await seedAgendaAppointment(request, "layout-portal-confirmar");
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      timezoneId: "America/Sao_Paulo",
    });
    await context.addCookies([sessionCookie(w.patientEmail, "patient")]);
    const page = await context.newPage();
    await page.setViewportSize(MOBILE);
    await page.goto("/portal");
    await settle(page);
    const item = page
      .locator("section", { hasText: "Próximas consultas" })
      .locator("li", { has: page.getByRole("button", { name: "Confirmar presença" }) })
      .first();
    const button = await item.getByRole("button", { name: "Confirmar presença" }).boundingBox();
    const date = await item.locator("[data-appointment-when]").boundingBox();
    const disjoint =
      button!.x >= date!.x + date!.width ||
      date!.x >= button!.x + button!.width ||
      button!.y >= date!.y + date!.height ||
      date!.y >= button!.y + button!.height;
    expect(disjoint).toBe(true);
    await context.close();
  });

  test("portal: saudação no degrau headline", async ({ browser, request }) => {
    const w = await world(request);
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await context.addCookies([sessionCookie(w.patientEmail, "patient")]);
    const page = await context.newPage();
    for (const [viewport, token] of [
      [MOBILE, "--sv-text-2xl"],
      [DESKTOP, "--sv-text-4xl"],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/portal");
      await settle(page);
      const sizes = await page.locator("h1").first().evaluate((el, name) => {
        const probe = document.createElement("div");
        probe.style.fontSize = `var(${name})`;
        document.body.append(probe);
        const expected = getComputedStyle(probe).fontSize;
        probe.remove();
        return { actual: getComputedStyle(el).fontSize, expected };
      }, token);
      expect(sizes.actual).toBe(sizes.expected);
    }
    await context.close();
  });

  test("documentos sem scroll lateral", async ({ page, request }) => {
    const w = await world(request);
    const { receiptUrl } = await seedReceipt(request);
    await page.setViewportSize(MOBILE);
    for (const url of [
      `/documentos/atestado/${w.appointmentId}`,
      `/documentos/consentimento/${w.patientId}`,
      `/documentos/relatorio/${w.conditionId}`,
      `/documentos/plano-cuidados/${w.carePlanId}`,
      receiptUrl,
      await mockPayoutReceipt(page),
    ]) {
      await page.goto(url);
      await settle(page);
      // O documento renderizou de fato (moldura com a ação de imprimir), não uma página de erro.
      await expect(page.getByRole("button", { name: "Imprimir / salvar PDF" }), url).toBeVisible();
      expect(await scrollWidth(page), url).toBeLessThanOrEqual(MOBILE.width + 2);
      const unwrapped = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll("table")).filter((t) => {
            const scroller = t.closest(".overflow-x-auto, .sv-table-container");
            return !scroller || getComputedStyle(scroller).overflowX !== "auto";
          }).length,
      );
      expect(unwrapped, url).toBe(0);
    }
  });
});

test.describe("regra de toque da lib no desktop", () => {
  test("desktop com mouse mantém a altura da lib", async ({ page, request }) => {
    await world(request);
    await page.setViewportSize(DESKTOP);
    await page.goto("/pacientes");
    await settle(page);
    const sizes = await page
      .locator("[data-page-header-actions] .sv-btn")
      .first()
      .evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.height = "var(--sv-space-10)";
        document.body.append(probe);
        const base = probe.getBoundingClientRect().height;
        probe.remove();
        return { height: el.getBoundingClientRect().height, base };
      });
    // Em 1440x900 com ponteiro fino a regra de 44px não se aplica: o botão
    // continua com a altura base da lib (--sv-space-10).
    expect(sizes.base).toBeLessThan(44);
    expect(sizes.height).toBe(sizes.base);
  });
});
