import { expect, test } from "@playwright/test";
import { createAppointment, createPatient, createProfessional, unique } from "./support/api";
import { businessDay } from "./support/dates";

/**
 * #551, agenda no servidor (ADR-077): a carga não chama `/api`, o período vem da URL e a tela não
 * salta ao hidratar (CLS < 0,05 nas 4 larguras, também com a CPU 4x mais lenta e a agenda cheia).
 */
const CLS_LIMIT = 0.05;
const pad = (n: number) => String(n).padStart(2, "0");

test.describe("Agenda no servidor: agenda cheia", () => {
  test.beforeAll(async ({ request }) => {
    const professional = await createProfessional(request, { fullName: `Enf. Servidor ${unique()}` });
    const patient = await createPatient(request, { fullName: `Paciente Servidor ${unique()}` });
    const today = new Date();
    // Várias consultas no mês corrente para o mês e as listas terem conteúdo real.
    for (let i = 0; i < 6; i++) {
      const day = businessDay(i + 1);
      const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
      // O Playwright refaz o beforeAll quando reinicia o worker: o mesmo horário já ocupado (409) não é erro.
      await createAppointment(request, {
        patientId: patient.id,
        startsAt: `${date}T${pad(9 + i)}:00:00-03:00`,
        endsAt: `${date}T${pad(9 + i)}:30:00-03:00`,
        procedure: `Curativo servidor ${i} ${today.getTime()}`,
        priceCents: 10000,
        professionalId: professional.id,
      }).catch(() => undefined);
    }
  });

  for (const [width, cpu] of [360, 390, 768, 1280].flatMap((w) => [1, 4].map((c) => [w, c] as const))) {
    test(`em ${width}px (CPU ${cpu}x mais lenta) a carga não chama /api e a agenda não salta`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      const apiCalls: string[] = [];
      page.on("request", (request) => {
        const type = request.resourceType();
        if ((type === "fetch" || type === "xhr") && new URL(request.url()).pathname.startsWith("/api/")) {
          apiCalls.push(`${request.method()} ${new URL(request.url()).pathname}`);
        }
      });
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") problems.push(message.text());
      });
      await page.addInitScript(() => {
        const box = { cls: 0 };
        (window as unknown as { __cls: typeof box }).__cls = box;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            if (!shift.hadRecentInput) box.cls += shift.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });

      await page.goto("/agenda");
      await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
      await expect(page.getByRole("group", { name: "Filtrar por status" })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(apiCalls, "chamadas /api na carga").toEqual([]);
      expect(problems.filter((text) => /hydrat/i.test(text)), "avisos de hidratação").toEqual([]);
      const cls = await page.evaluate(() => (window as unknown as { __cls: { cls: number } }).__cls.cls);
      expect(cls, "CLS da agenda").toBeLessThanOrEqual(CLS_LIMIT);
    });
  }

  test("o período vem da URL: ?visao=dia&dia=… abre a visão Dia no dia pedido", async ({ page }) => {
    const day = businessDay(2);
    const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/agenda?visao=dia&dia=${date}`);
    await expect(page.getByRole("button", { name: "Dia", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-week-day]")).toHaveCount(1);
    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await expect(page).not.toHaveURL(/visao=/);
    await expect(page.getByLabel("Mês anterior")).toBeVisible();
  });
});
