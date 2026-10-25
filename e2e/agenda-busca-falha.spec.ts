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

/**
 * #578 / #551: a leitura da agenda mora no servidor, então o navegador não consegue mais fazer a
 * busca «responder 429». O alerta «Não foi possível carregar as consultas.» e o «Tentar de novo»
 * seguem cobertos por `tests/pages/agenda-busca-falha.test.tsx` (falha injetada na camada de
 * dados). Aqui ficam os cenários de ponta a ponta que não dependem da falha: a grade só desenha o
 * recorte dos chips, em todas as larguras, e a URL guarda o recorte.
 */

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

test.describe("agenda: recorte dos chips na grade (#578)", () => {
  for (const width of [360, 390, 768, 1280]) {
    test(`marcar «Cancelada» traz o recorte dos chips e a URL o guarda (${width}px)`, async ({ page, request }) => {
      const s = await seed(request);
      const name = shown(s.patient.fullName);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/agenda");
      await page.getByLabel("Filtrar por profissional").selectOption(s.professional.id);
      await goToMonth(page, s.day);
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toBeVisible();

      await page.getByRole("button", { name: /^Cancelada/ }).click();

      // O chip fica como o usuário o deixou e a URL guarda o recorte.
      await expect(page.getByRole("button", { name: /^Cancelada/ })).toHaveAttribute("aria-pressed", "true");
      await expect(page).toHaveURL(/status=.*cancelled/);
      // Chips e grade concordam: Cancelada marcada, a agendada continua marcada (padrão + cancelada).
      await expect(gridEntry(page, width, s.day.day, `10:00 ${name}`)).toBeVisible();
      await expect(page.getByRole("button", { name: /^Agendada/ })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("alert").filter({ hasText: "Não foi possível" })).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("a grade nunca mostra consulta de status desmarcado depois de trocar os chips", async ({ page, request }) => {
    const s = await seed(request);
    const name = shown(s.patient.fullName);
    await page.goto("/agenda?status=scheduled");
    await page.getByLabel("Filtrar por profissional").selectOption(s.professional.id);
    await goToMonth(page, s.day);
    await expect(page.getByRole("button", { name: `09:00 ${name}`, exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Agendada/ }).click();
    await page.getByRole("button", { name: /^Cancelada/ }).click();

    await expect(page.getByRole("button", { name: `10:00 ${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `09:00 ${name}`, exact: true })).toHaveCount(0);
  });
});
