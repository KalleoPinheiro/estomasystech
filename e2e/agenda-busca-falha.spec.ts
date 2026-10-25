import { expect, test } from "@playwright/test";
import {
  changeAppointmentStatus,
  createAppointment,
  createPatient,
  createProfessional,
  unique,
} from "./support/api";
import { goToMonth } from "./support/calendar";
import { businessDay } from "./support/dates";
import { shown } from "./support/patient-name";

const pad = (n: number) => String(n).padStart(2, "0");

/** Uma agendada e uma cancelada no mesmo dia, de um profissional só do teste. */
async function seed(request: Parameters<typeof createPatient>[0]) {
  const professional = await createProfessional(request, { fullName: `Enf. Falha ${unique()}` });
  const patient = await createPatient(request, { fullName: `Paciente Falha ${unique()}` });
  const day = businessDay(150);
  const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
  const make = (hour: number) =>
    createAppointment(request, {
      patientId: patient.id,
      startsAt: `${date}T${pad(hour)}:00:00-03:00`,
      endsAt: `${date}T${pad(hour)}:30:00-03:00`,
      procedure: `Curativo ${hour}h`,
      priceCents: 10000,
      professionalId: professional.id,
    });
  await make(9);
  const cancelled = await make(10);
  await changeAppointmentStatus(request, cancelled.id, "cancel");
  return { professional, patient, day };
}

/** Na grade o bloco da consulta; no mês compacto do celular, o dia marcado «com consultas». */
function gridEntry(page: import("@playwright/test").Page, width: number, day: number, label: string) {
  return width < 768
    ? page.getByRole("button", { name: `${day}, com consultas`, exact: true })
    : page.getByRole("button", { name: label, exact: true });
}

test.describe("agenda: busca que falha (#578)", () => {
  for (const width of [360, 390, 768, 1280]) {
    test(`429 na busca mostra alerta e «Tentar de novo»; o retry traz o recorte dos chips (${width}px)`, async ({
      page,
      request,
    }) => {
      const s = await seed(request);
      const name = shown(s.patient.fullName);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/agenda");
      await page.getByLabel("Filtrar por profissional").selectOption(s.professional.id);
      await goToMonth(page, s.day);
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toBeVisible();

      // A busca das consultas passa a responder 429.
      let blocked = true;
      await page.route("**/api/appointments?*", async (route) => {
        if (blocked) {
          await route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({ success: false, data: null, error: "Muitas requisições" }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByRole("button", { name: /^Cancelada/ }).click();

      const alert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar as consultas." });
      await expect(alert).toBeVisible();
      await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
      // O chip fica como o usuário o deixou e a grade não mostra o recorte anterior.
      await expect(page.getByRole("button", { name: /^Cancelada/ })).toHaveAttribute("aria-pressed", "true");
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toHaveCount(0);
      await expect(page).toHaveURL(/status=.*cancelled/);

      blocked = false;
      await page.getByRole("button", { name: "Tentar de novo" }).click();

      await expect(alert).toHaveCount(0);
      // Chips e grade concordam: Cancelada marcada, a agendada continua marcada (padrão + cancelada).
      await expect(gridEntry(page, width, s.day.day, `10:00 ${name}`)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Agendada/ })).toHaveAttribute("aria-pressed", "true");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("a grade nunca mostra consulta de status desmarcado depois de falha e retry", async ({ page, request }) => {
    const s = await seed(request);
    const name = shown(s.patient.fullName);
    await page.goto("/agenda?status=scheduled");
    await page.getByLabel("Filtrar por profissional").selectOption(s.professional.id);
    await goToMonth(page, s.day);
    await expect(page.getByRole("button", { name: `09:00 ${name}`, exact: true })).toBeVisible();

    await page.route("**/api/appointments?*", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ success: false, data: null, error: "Muitas requisições" }),
      }),
    );
    await page.getByRole("button", { name: /^Agendada/ }).click();
    await page.getByRole("button", { name: /^Cancelada/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível" })).toBeVisible();
    await expect(page.getByRole("button", { name: `09:00 ${name}`, exact: true })).toHaveCount(0);

    await page.unroute("**/api/appointments?*");
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(page.getByRole("button", { name: `10:00 ${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `09:00 ${name}`, exact: true })).toHaveCount(0);
  });

  for (const width of [360, 1280]) {
    test(`falha ao refazer a mesma URL esconde a grade e deixa o alerta (${width}px)`, async ({ page, request }) => {
      const s = await seed(request);
      const name = shown(s.patient.fullName);
      await page.setViewportSize({ width, height: 900 });
      // A contagem falha desde o início: o alerta aparece com a grade da URL corrente.
      await page.route("**/api/appointments/status-counts?*", (route) =>
        route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ success: false, data: null, error: "Muitas requisições" }),
        }),
      );
      await page.goto("/agenda");
      await page.getByLabel("Filtrar por profissional").selectOption(s.professional.id);
      await goToMonth(page, s.day);
      const alert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar as consultas." });
      await expect(alert).toBeVisible();
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toBeVisible();

      // Agora a lista também falha, na mesma URL: refazer não pode deixar a grade antiga.
      await page.route("**/api/appointments?*", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ success: false, data: null, error: "Erro interno" }),
        }),
      );
      await page.getByRole("button", { name: "Tentar de novo" }).click();

      await expect(alert).toBeVisible();
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toHaveCount(0);
    });
  }
});

