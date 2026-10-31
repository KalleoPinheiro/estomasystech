import { expect, test } from "@playwright/test";
import {
  addAssessment,
  createAppointment,
  createCondition,
  createFollowUp,
  createInvoice,
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

test.describe("Portal do paciente no servidor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let patientEmail = "";
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
    await context.close();
  });

  for (const width of [360, 390, 768, 1280]) {
    test(`/portal em ${width}px: a carga não chama /api e não salta`, async ({ page }) => {
      await page.context().addCookies([sessionCookie(patientEmail, "patient")]);
      await page.setViewportSize({ width, height: 800 });
      // Celular de entrada: a CPU 4x mostra salto que a máquina de desenvolvimento esconde.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: width <= 390 ? 4 : width <= 768 ? 2 : 1 });
      const apiCalls: string[] = [];
      page.on("request", (request) => {
        const type = request.resourceType();
        const { pathname } = new URL(request.url());
        // Foto autenticada continua pela API (ADR-069); aqui não há foto.
        if ((type === "fetch" || type === "xhr") && pathname.startsWith("/api/")) {
          apiCalls.push(`${request.method()} ${pathname}`);
        }
      });
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
                  `${(source.node as HTMLElement | null)?.outerHTML.slice(0, 50) ?? "?"} top ${Math.round(source.previousRect.top)}→${Math.round(source.currentRect.top)}`,
              )
              .join(" | ");
            box.shifts.push(`${shift.value.toFixed(4)} ${who}`);
          }
        }).observe({ type: "layout-shift", buffered: true });
      });

      await page.goto("/portal");
      await expect(page.getByRole("heading", { level: 1, name: `Olá, ${firstName}!` })).toBeVisible();
      await expect(page.getByText(procedureLabel)).toBeVisible();
      await expect(page.getByText("Fatura portal servidor").first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
      const { cls, lcp, shifts } = await page.evaluate(
        () => (window as unknown as { __cls: { cls: number; lcp: number; shifts: string[] } }).__cls,
      );
      // Sem rede limitada aqui; a régua do orquestrador mede o LCP com 1,6 Mbps.
      expect(lcp, "LCP do portal").toBeLessThanOrEqual(2500);
      expect(cls, `CLS do portal: ${shifts.join(" // ")}`).toBeLessThan(CLS_LIMIT);
    });
  }

  test("/portal sem sessão leva ao login com sessão expirada", async ({ page }) => {
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/login/);
  });
});
