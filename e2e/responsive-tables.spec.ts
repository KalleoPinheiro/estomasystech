import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  addAssessment,
  apiPost,
  completeAppointment,
  createAppointment,
  createCarePlan,
  createCondition,
  createInvoice,
  createPartner,
  createPatient,
  createProcedure,
  createProfessional,
  createSupply,
  unique,
} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";
import { shown } from "./support/patient-name";

/**
 * Cobre FASEA-06/07/09: 11 telas do staff embrulharam sua tabela em
 * `overflow-x-auto` (T6–T16) — este spec prova, em viewport mobile real, que
 * (1) a página inteira não ganha scroll horizontal e (2) o wrapper realmente
 * existe ao redor da tabela renderizada (não só quando ela está vazia).
 */
const VIEWPORT = { width: 375, height: 667 };
const MIN_TOUCH_TARGET_PX = 44;

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  // Pequena margem para arredondamento/borda — nunca amputação real de conteúdo.
  expect(scrollWidth).toBeLessThanOrEqual(VIEWPORT.width + 2);
}

async function expectTableWrappedInOverflowContainer(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    return {
      count: tables.length,
      allWrapped: tables.every((table) => table.closest(".overflow-x-auto") !== null),
    };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.allWrapped).toBe(true);
}

/**
 * NOC/NIC exigem catálogo prescrito (`outcomeCode`/`interventionCode` válidos) —
 * não há atalho de "criar direto"; usamos códigos reais do seed de estomaterapia
 * (mesmos usados em `e2e/plano-cuidados.spec.ts` via UI) para popular as duas
 * tabelas do documento impresso do plano de cuidados.
 */
async function seedCarePlanWithOutcomeAndIntervention(
  request: APIRequestContext,
  patientId: string,
): Promise<string> {
  const plan = await createCarePlan(request, patientId);
  await apiPost(request, `/api/care-plans/${plan.id}/outcomes`, {
    outcomeCode: "1101",
    baselineScore: 2,
    targetScore: 4,
  });
  await apiPost(request, `/api/care-plans/${plan.id}/interventions`, {
    interventionCode: "3660",
    frequency: "A cada troca de placa",
    priority: "alta",
  });
  return plan.id;
}

/** Mês civil de hoje no fuso do app (APP_TIMEZONE, ADR-073), não no do processo. */
function civilToday(): { year: number; month0: number } {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE ?? "America/Sao_Paulo",
  }).format(new Date());
  const [year, month] = key.split("-").map(Number);
  return { year, month0: month - 1 };
}

/**
 * A página não tem mais `<input type="month">` (achado REL-02 — mês vira texto
 * pt-BR + navegação ‹›, ver relatorios.spec.ts). Chega no mês pedido clicando
 * "Próximo mês"/"Mês anterior" a quantidade de vezes necessária.
 */
async function setReportMonth(page: Page, year: number, month: number): Promise<void> {
  const now = civilToday();
  const delta = (year - now.year) * 12 + (month - 1 - now.month0);
  const step = delta >= 0 ? 1 : -1;
  const button = page.getByRole("button", { name: delta >= 0 ? "Próximo mês" : "Mês anterior" });

  for (let i = 1; i <= Math.abs(delta); i += 1) {
    const target = new Date(now.year, now.month0 + step * i, 1);
    const targetValue = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
    // Um clique só por mês — repetir o clique dentro de um toPass avançaria o mês
    // de novo se a resposta demorasse mais que o timeout da tentativa anterior.
    const requested = page.waitForResponse(
      (response) => response.url().includes(`/api/reports?month=${targetValue}`),
      { timeout: 20_000 },
    );
    await button.click();
    await requested;
  }
}

test.describe("tabelas responsivas em viewport mobile (375x667)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test("faturamento", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Fatura Mobile ${unique()}` });
    await createInvoice(request, {
      patientId: patient.id,
      description: `Fatura mobile E2E ${unique()}`,
      amountCents: 5000,
    });

    await page.goto("/faturamento");
    await expect(page.getByText(shown(patient.fullName))).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("relatórios", async ({ page, request }) => {
    const professional = await createProfessional(request, { fullName: `Enf. Mobile ${unique()}` });
    const patient = await createPatient(request, { fullName: `Paciente Relatório Mobile ${unique()}` });
    const slot = slotForAttempt("responsive-tables-relatorios");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure: `Sessão mobile E2E ${unique()}`,
      priceCents: 8000,
      professionalId: professional.id,
    });
    await completeAppointment(request, appointment.id);

    await page.goto("/relatorios");
    await setReportMonth(page, slot.ymd.year, slot.ymd.month);
    await expect(page.getByText(professional.fullName)).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("profissionais", async ({ page, request }) => {
    const professional = await createProfessional(request, { fullName: `Enf. Responsivo ${unique()}` });

    await page.goto("/profissionais");
    await expect(page.getByText(professional.fullName)).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("pacientes", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Responsivo ${unique()}` });

    await page.goto("/pacientes");
    // A lista é paginada (100 por página, por nome): com a suíte inteira passando de 100 pacientes
    // antes de «Paciente Responsivo», ele cai na 2ª página. A busca traz o paciente para a tela.
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(patient.fullName);
    await expect(page.getByText(shown(patient.fullName))).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("parceiros", async ({ page, request }) => {
    const partner = await createPartner(request, { fullName: `Dr. Parceiro Responsivo ${unique()}` });

    await page.goto("/parceiros");
    await expect(page.getByText(partner.fullName)).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("auditoria", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Auditoria Mobile ${unique()}` });
    // Criar condição gera evento de auditoria (recordAudit em .../conditions/route.ts).
    await createCondition(request, patient.id, { kind: "wound", title: `Ferida auditoria ${unique()}` });

    await page.goto("/auditoria");
    await expect(page.locator("table")).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("procedimentos", async ({ page, request }) => {
    const procedure = await createProcedure(request, { name: `Procedimento Responsivo ${unique()}` });

    await page.goto("/procedimentos");
    await expect(page.getByText(procedure.name)).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("configurações", async ({ page }) => {
    // A conta do Admin de Empresa da sessão padrão já garante ao menos 1 linha na tabela.
    await page.goto("/configuracoes/contas");
    await expect(page.locator("table")).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("materiais", async ({ page, request }) => {
    const supply = await createSupply(request, { name: `Insumo Responsivo ${unique()}` });

    await page.goto("/materiais");
    // Insumo sem saldo entra no alerta de estoque baixo, cujo texto repete o nome
    // do insumo — getByRole("cell") mira só a linha da tabela, não o alerta.
    await expect(page.getByRole("cell", { name: supply.name })).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("documento impresso: plano de cuidados", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Plano Mobile ${unique()}` });
    const carePlanId = await seedCarePlanWithOutcomeAndIntervention(request, patient.id);

    const response = await page.goto(`/documentos/plano-cuidados/${carePlanId}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Integridade tissular")).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("documento impresso: relatório de evolução", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Relatório Doc Mobile ${unique()}` });
    const condition = await createCondition(request, patient.id, {
      kind: "wound",
      title: `Ferida documento mobile ${unique()}`,
    });
    await addAssessment(request, condition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });

    const response = await page.goto(`/documentos/relatorio/${condition.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("20×10×2")).toBeVisible();
    await expectTableWrappedInOverflowContainer(page);
    await expectNoHorizontalScroll(page);
  });

  test("SidebarTrigger tem alvo de toque mínimo de 44x44px em mobile", async ({ page }) => {
    await page.goto("/faturamento");
    const sidebarTrigger = page.locator("button[aria-expanded]").first();
    await expect(sidebarTrigger).toBeVisible();

    const box = await sidebarTrigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });
});
