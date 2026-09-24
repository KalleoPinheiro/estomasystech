import { test, expect, type BrowserContext, type APIRequestContext, type Page } from "@playwright/test";
import {
  addAssessment,
  createAppointment,
  createCondition,
  createFollowUp,
  createInvoice,
  createPartner,
  createPatient,
  createProcedure,
  unique,
} from "./support/api";
import { businessDay, type SlotSeed, slotForAttempt, ymdToDateInput } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";
import { literal } from "./support/regexp";
import { sessionCookie } from "./support/session-token";

/**
 * Issue #127: o portal é a superfície do paciente e do parceiro — provavelmente
 * aberta no celular. Prova, nos dois viewports de referência, que (1) nenhuma tela
 * ganha scroll horizontal (mesmo critério de `responsive-tables.spec.ts`) e (2) todo
 * controle visível tem alvo de toque de pelo menos 44x44 px (WCAG 2.5.5).
 */
/**
 * Seeds de horário registradas em `SLOT_SEEDS` (`e2e/support/slots.ts`): cada uma
 * tem dia útil exclusivo, então não colidem com as demais seeds da suíte.
 */
const VIEWPORTS = [
  {
    width: 390,
    height: 844,
    patientSeed: "portal-responsivo-paciente-390x844-1",
    partnerSeed: "portal-responsivo-parceiro-390x844",
  },
  {
    width: 375,
    height: 667,
    patientSeed: "portal-responsivo-paciente-375x667-1",
    partnerSeed: "portal-responsivo-parceiro-375x667",
  },
] as const;
const MIN_TOUCH_TARGET_PX = 44;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function expectNoHorizontalScroll(page: Page, width: number, state: string): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  // Pequena margem para arredondamento/borda — nunca amputação real de conteúdo.
  expect(scrollWidth, `scroll horizontal em "${state}"`).toBeLessThanOrEqual(width + 2);
}

/**
 * Lista os controles visíveis abaixo do alvo mínimo, descritos pelo nome, para o
 * spec falhar apontando qual controle quebrou — não só "algum". `querySelectorAll`
 * não atravessa shadow DOM, então o indicador do `next dev` fica de fora.
 */
async function expectTouchTargets(page: Page, state: string): Promise<void> {
  const tooSmall = await page.evaluate((min) => {
    const controls = document.querySelectorAll<HTMLElement>(
      "button, a[href], input, select, textarea",
    );
    return Array.from(controls)
      .filter((el) => el.checkVisibility({ visibilityProperty: true }))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const name =
          el.getAttribute("aria-label") ??
          el.getAttribute("placeholder") ??
          (el.textContent ?? "").trim().slice(0, 40);
        return {
          control: `<${el.tagName.toLowerCase()}> ${name}`,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0)
      .filter((box) => box.width < min || box.height < min);
  }, MIN_TOUCH_TARGET_PX);
  expect(tooSmall, `controles abaixo de 44x44px em "${state}"`).toEqual([]);
}

async function expectMobileFriendly(page: Page, width: number, state: string): Promise<void> {
  await expectNoHorizontalScroll(page, width, state);
  await expectTouchTargets(page, state);
}

/** Consulta curta: o portal só precisa de uma consulta futura para exibir. */
const SLOT_MINUTES = 15;

/** Toast é transitório e mora fora do portal — mede a tela depois que ele sai. */
async function waitToastGone(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: true })).toHaveCount(0, { timeout: 15_000 });
}

interface SeededPatient {
  firstName: string;
  procedureLabel: string;
  procedureName: string;
  procedureId: string;
}

async function seedPatientPortal(
  request: APIRequestContext,
  context: BrowserContext,
  seed: SlotSeed,
): Promise<SeededPatient> {
  const patient = await createPatient(request, { fullName: `Paciente Mobile ${unique()}` });
  const procedure = await createProcedure(request, { name: `Curativo mobile ${unique()}` });
  const slot = slotForAttempt(seed, SLOT_MINUTES);
  const procedureLabel = `Consulta mobile E2E ${unique()}`;
  await createAppointment(request, {
    patientId: patient.id,
    startsAt: toApiDatetime(slot.startsAt),
    endsAt: toApiDatetime(slot.endsAt),
    procedure: procedureLabel,
    priceCents: 12000,
  });
  const condition = await createCondition(request, patient.id, {
    kind: "wound",
    title: `Ferida mobile E2E ${unique()}`,
  });
  // Duas avaliações com medida: o gráfico de evolução só aparece a partir da segunda.
  await addAssessment(request, condition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });
  await addAssessment(request, condition.id, { lengthMm: 16, widthMm: 8, depthMm: 1 });
  await createFollowUp(request, {
    patientId: patient.id,
    dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    reason: `Reavaliar a ferida ${unique()}`,
  });
  await createInvoice(request, {
    patientId: patient.id,
    description: `Fatura mobile E2E ${unique()}`,
    amountCents: 9000,
  });

  await context.addCookies([sessionCookie(patient.email, "patient")]);
  // Pedido na lista de espera feito pelo próprio paciente (rota do portal).
  const fromDate = ymdToDateInput(businessDay(3));
  const waitlist = await context.request.post("/api/portal/patient/waitlist", {
    data: { procedureId: procedure.id, fromDate, toDate: ymdToDateInput(businessDay(20)) },
  });
  expect(waitlist.ok()).toBe(true);

  return {
    firstName: patient.fullName.split(" ")[0],
    procedureLabel,
    procedureName: procedure.name,
    procedureId: procedure.id,
  };
}

for (const viewport of VIEWPORTS) {
  const size = `${viewport.width}x${viewport.height}`;

  test.describe(`portal em viewport mobile (${size})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test(`paciente: todas as telas sem scroll horizontal e com alvos de toque >= 44px (${size})`, async ({
      page,
      context,
      request,
    }) => {
      const seeded = await seedPatientPortal(request, context, viewport.patientSeed);

      await page.goto("/portal");
      await expect(page.getByRole("heading", { name: `Olá, ${seeded.firstName}!` })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Termo de consentimento pendente" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Lista de espera" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Agendar retorno" })).toBeVisible();
      await expect(page.getByLabel("Gráfico de evolução da condição")).toBeVisible();
      await expectMobileFriendly(page, viewport.width, "visão inicial");

      // Alterar consulta: remarcar (dia + horários) e cancelar (motivo).
      const upcoming = page.locator("section", { hasText: "Próximas consultas" });
      const appointmentItem = upcoming.locator("li", { hasText: seeded.procedureLabel });
      await appointmentItem.getByRole("button", { name: "Remarcar" }).click();
      await expect(appointmentItem.getByLabel("Novo dia")).toBeVisible();
      await expect(appointmentItem.getByText("Buscando horários…")).toHaveCount(0);
      await expectMobileFriendly(page, viewport.width, "remarcar consulta");

      await appointmentItem.getByRole("button", { name: "Cancelar consulta" }).click();
      await expect(appointmentItem.getByLabel("Motivo (opcional)")).toBeVisible();
      await expectMobileFriendly(page, viewport.width, "cancelar consulta");

      // Agendar retorno: procedimento + dia + horários (ou lista de espera).
      await page.getByRole("button", { name: "Agendar retorno" }).click();
      await page.getByLabel("Procedimento").selectOption(seeded.procedureId);
      await expect(page.getByLabel("Dia", { exact: true })).toBeVisible();
      await expect(page.getByText("Buscando horários…")).toHaveCount(0);
      await expectMobileFriendly(page, viewport.width, "agendar retorno");

      // Consentimento aceito: revogação + envio de foto com prévia.
      await page.getByRole("button", { name: "Li e aceito o termo" }).click();
      await expect(page.getByRole("button", { name: "Revogar consentimento" })).toBeVisible();
      await waitToastGone(page, "Termo de consentimento aceito");
      await expectMobileFriendly(page, viewport.width, "consentimento aceito");

      await page.locator('input[type="file"]').setInputFiles({
        name: "evolucao-mobile.png",
        mimeType: "image/png",
        buffer: TINY_PNG,
      });
      await expect(page.getByAltText("Prévia da foto selecionada")).toBeVisible();
      await expectMobileFriendly(page, viewport.width, "prévia da foto");
    });

    test(`parceiro: lista e evolução sem scroll horizontal e com alvos de toque >= 44px (${size})`, async ({
      page,
      context,
      request,
    }) => {
      const partner = await createPartner(request, { fullName: `Dr. Parceiro Mobile ${unique()}` });
      const referred = await createPatient(request, {
        fullName: `Paciente Indicado Mobile ${unique()}`,
        referredByPartnerId: partner.id,
      });
      const slot = slotForAttempt(viewport.partnerSeed, SLOT_MINUTES);
      const procedure = `Avaliação mobile E2E ${unique()}`;
      await createAppointment(request, {
        patientId: referred.id,
        startsAt: toApiDatetime(slot.startsAt),
        endsAt: toApiDatetime(slot.endsAt),
        procedure,
        priceCents: 18000,
      });
      const condition = await createCondition(request, referred.id, {
        kind: "wound",
        title: `Ferida indicada mobile ${unique()}`,
      });
      // Duas avaliações com medida: o gráfico de evolução só aparece a partir da segunda.
      await addAssessment(request, condition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });
      await addAssessment(request, condition.id, { lengthMm: 16, widthMm: 8, depthMm: 1 });

      await context.addCookies([sessionCookie(partner.email, "partner")]);
      await page.goto("/portal");
      await expect(page.getByRole("heading", { name: partner.fullName })).toBeVisible();
      await expectMobileFriendly(page, viewport.width, "parceiro: lista");

      await page.getByRole("button", { name: literal(referred.fullName) }).click();
      await expect(page.getByText(procedure)).toBeVisible();
      await expect(page.getByText(condition.title)).toBeVisible();
      await expectMobileFriendly(page, viewport.width, "parceiro: evolução do indicado");
    });
  });
}

test.describe("portal em viewport desktop", () => {
  test("desktop com ponteiro fino mantém o Button size=sm do design system (36px)", async ({
    page,
    context,
    request,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const patient = await createPatient(request, { fullName: `Paciente Desktop ${unique()}` });
    const slot = slotForAttempt("portal-responsivo-desktop", SLOT_MINUTES);
    await createAppointment(request, {
      patientId: patient.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure: `Consulta desktop E2E ${unique()}`,
      priceCents: 12000,
    });

    await context.addCookies([sessionCookie(patient.email, "patient")]);
    await page.goto("/portal");
    const confirm = page.getByRole("button", { name: "Confirmar presença" });
    await expect(confirm).toBeVisible();
    const box = await confirm.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBe(36);
  });
});
