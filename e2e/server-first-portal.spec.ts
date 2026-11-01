import { expect, type Page, test } from "@playwright/test";
import {
  addAssessment,
  createAppointment,
  createCondition,
  createFollowUp,
  createInvoice,
  createPartner,
  createPatient,
  linkPortalAccount,
  unique,
} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";
import { sessionCookie } from "./support/session-token";

/**
 * #553, portal do paciente no servidor (ADR-081): a carga não chama `/api` e a
 * tela não salta nas quatro larguras, com o dado real de um paciente (consulta,
 * evolução com duas avaliações, retorno e fatura). Meta interna de CLS < 0,05;
 * o aceite do critério é a medição com CPU 4x da régua `linha-base.spec.ts`.
 */
const CLS_LIMIT = 0.05;

type Metrics = { cls: number; lcp: number; shifts: string[] };

function trackApiCalls(page: Page): string[] {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    const type = request.resourceType();
    const { pathname } = new URL(request.url());
    // Foto autenticada continua pela API (ADR-069); aqui não há foto.
    if ((type === "fetch" || type === "xhr") && pathname.startsWith("/api/")) {
      apiCalls.push(`${request.method()} ${pathname}`);
    }
  });
  return apiCalls;
}

/** Celular de entrada: CPU 4x (até 390 px) e, se pedido, 1,6 Mbps com 150 ms, como a régua do orquestrador. */
async function setupMetrics(page: Page, width: number, slowNetwork: boolean): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: width <= 390 ? 4 : width <= 768 ? 2 : 1 });
  if (slowNetwork) {
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  await page.addInitScript(() => {
    const box = { cls: 0, lcp: 0, shifts: [] as string[] };
    (window as unknown as { __cls: typeof box }).__cls = box;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) box.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node?: Element | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
        };
        if (shift.hadRecentInput) continue;
        box.cls += shift.value;
        // Quem se mexeu, para o relatório de falha apontar o elemento.
        const who = (shift.sources ?? [])
          .map(
            (source) =>
              `${(source.node as HTMLElement | null)?.outerHTML.slice(0, 50) ?? "?"} top ${Math.round(source.previousRect.top)}→${Math.round(source.currentRect.top)} h ${Math.round(source.previousRect.height)}→${Math.round(source.currentRect.height)}`,
          )
          .join(" | ");
        box.shifts.push(`${shift.value.toFixed(4)} ${who}`);
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function readMetrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => (window as unknown as { __cls: Metrics }).__cls);
}

test.describe("Portal do paciente no servidor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let patientEmail = "";
  let partnerEmail = "";
  // Um titular novo por largura: aceitar o termo e pedir correção mudam o dado.
  const actingEmails: Record<number, string> = {};
  let firstName = "";
  let procedureLabel = "";

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([sessionCookie("local", "company_admin")]);
    const request = context.request;
    // Massa própria e idempotente: nome único por execução, uma seed de horário fixa.
    const patient = await createPatient(request, { fullName: `Paciente Portal Servidor ${unique()}` });
    patientEmail = patient.email;
    firstName = patient.fullName.split(" ")[0];
    const slot = slotForAttempt("server-first-portal");
    procedureLabel = `Consulta portal servidor ${unique()}`;
    await createAppointment(request, {
      patientId: patient.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure: procedureLabel,
      priceCents: 12_000,
    });
    const condition = await createCondition(request, patient.id, {
      kind: "wound",
      title: `Ferida portal servidor ${unique()}`,
    });
    await addAssessment(request, condition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });
    await addAssessment(request, condition.id, { lengthMm: 16, widthMm: 8, depthMm: 1 });
    await createFollowUp(request, {
      patientId: patient.id,
      dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      reason: `Reavaliar a ferida ${unique()}`,
    });
    await createInvoice(request, {
      patientId: patient.id,
      description: `Fatura portal servidor ${unique()}`,
      amountCents: 9_000,
    });
    await linkPortalAccount(request, "patient", patient);
    for (const width of [360, 390]) {
      const acting = await createPatient(request, { fullName: `Titular Ações ${width} ${unique()}` });
      const actingCondition = await createCondition(request, acting.id, {
        kind: "wound",
        title: `Ferida ações ${unique()}`,
      });
      await addAssessment(request, actingCondition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });
      await createFollowUp(request, {
        patientId: acting.id,
        dueDate: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        reason: `Reavaliar ações ${unique()}`,
      });
      await createInvoice(request, { patientId: acting.id, description: `Fatura ações ${unique()}`, amountCents: 9_000 });
      await linkPortalAccount(request, "patient", acting);
      actingEmails[width] = acting.email;
    }
    // Parceiro com um indicado, para o portal do parceiro ter conteúdo real (#613).
    const partner = await createPartner(request, { fullName: `Dra. Parceira Servidor ${unique()}` });
    partnerEmail = partner.email;
    await createPatient(request, { fullName: `Indicado Servidor ${unique()}`, referredByPartnerId: partner.id });
    await linkPortalAccount(request, "partner", partner);
    await context.close();
  });

  for (const width of [360, 390, 768, 1280]) {
    test(`/portal em ${width}px: a carga não chama /api e não salta`, async ({ page }) => {
      await page.context().addCookies([sessionCookie(patientEmail, "patient")]);
      const apiCalls = trackApiCalls(page);
      await setupMetrics(page, width, false);

      await page.goto("/portal");
      await expect(page.getByRole("heading", { level: 1, name: `Olá, ${firstName}!` })).toBeVisible();
      await expect(page.getByText(procedureLabel)).toBeVisible();
      await expect(page.getByText("Fatura portal servidor").first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
      const { cls, lcp, shifts } = await readMetrics(page);
      // Sem rede limitada aqui; a régua do orquestrador mede o LCP com 1,6 Mbps.
      expect(lcp, "LCP do portal").toBeLessThanOrEqual(2500);
      expect(cls, `CLS do portal: ${shifts.join(" // ")}`).toBeLessThan(CLS_LIMIT);
    });
  }

  // #613: a régua é CLS < 0,05 em todo papel. Celular de entrada (CPU 4x) e rede
  // lenta (1,6 Mbps, 150 ms), cinco execuções seguidas por papel: o cabeçalho do
  // layout não pode saltar depois do primeiro paint nem no parceiro nem no paciente.
  for (const role of ["parceiro", "paciente"] as const) {
    for (const run of [1, 2, 3, 4, 5]) {
      test(`/portal de ${role} em 390px com rede lenta, execução ${run}: CLS abaixo do limite`, async ({ page }) => {
        const cookie = role === "parceiro" ? sessionCookie(partnerEmail, "partner") : sessionCookie(patientEmail, "patient");
        await page.context().addCookies([cookie]);
        await setupMetrics(page, 390, true);

        // Segunda visita: a primeira aquece o servidor e o que o navegador guarda em memória.
        await page.goto("/portal");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.goto("/portal");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");

        const { cls, shifts } = await readMetrics(page);
        expect(cls, `CLS do portal (${role}): ${shifts.join(" // ")}`).toBeLessThan(CLS_LIMIT);
      });
    }
  }

  // #623 (F3): depois das ações do titular a tela também não pode saltar.
  // O Next recarrega o servidor sem ação do usuário no meio: o que muda de
  // altura precisa mudar sem empurrar o resto da página.
  for (const width of [360, 390]) {
    test(`/portal em ${width}px: aceitar o termo e enviar pedido não saltam`, async ({ page }) => {
      await page.context().addCookies([sessionCookie(actingEmails[width], "patient")]);
      await setupMetrics(page, width, true);

      await page.goto("/portal");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      // Aceita os dois termos, um depois do outro: a troca do cartão de termo
      // por "aceito" é o que mais mexe na altura.
      for (const term of ["tratamento", "imagem"]) {
        await page.getByRole("checkbox").first().check();
        // O cartão aceito não pode voltar a mostrar o termo pendente enquanto a
        // releitura do servidor não chega (piscava aceito → pendente → aceito).
        await page.evaluate(() => {
          const w = window as unknown as { __pendingBack: number };
          w.__pendingBack = 0;
          new MutationObserver((records) => {
            for (const record of records) {
              for (const node of Array.from(record.addedNodes)) {
                if (node instanceof HTMLElement && /Li e aceito o termo/.test(node.textContent ?? "")) w.__pendingBack += 1;
              }
            }
          }).observe(document.body, { childList: true, subtree: true });
        });
        await page.getByRole("button", { name: `Li e aceito o termo de ${term}` }).click();
        await expect(page.getByText(new RegExp(`Termo de .*${term === "imagem" ? "imagem" : "tratamento"}.* aceito`)).first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
        expect(await page.evaluate(() => (window as unknown as { __pendingBack: number }).__pendingBack), `termo de ${term} voltou a pendente`).toBe(0);
      }
      await page.getByLabel(/O que precisa ser corrigido/).fill("Corrigir o telefone");
      await page.getByRole("button", { name: "Enviar pedido" }).click();
      await expect(page.getByText("Pedido enviado. A clínica vai analisar.").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);

      const { cls, shifts } = await readMetrics(page);
      expect(cls, `CLS depois das ações do titular: ${shifts.join(" // ")}`).toBeLessThan(CLS_LIMIT);
    });
  }

  test("/portal com a sessão apagada: enviar pedido leva ao login com sessão expirada", async ({ page }) => {
    await page.context().addCookies([sessionCookie(patientEmail, "patient")]);
    await page.goto("/portal");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByLabel(/O que precisa ser corrigido/).fill("Pedido sem sessão");
    await page.context().clearCookies();
    await page.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(page).toHaveURL(/\/login\?.*error=session_expired.*next=%2Fportal/);
  });

  test("/portal sem sessão leva ao login com sessão expirada", async ({ page }) => {
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/login/);
  });
});
