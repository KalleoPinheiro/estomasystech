import { expect, test } from "@playwright/test";
import {
  changeAppointmentStatus,
  completeAppointment,
  createAppointment,
  createPatient,
  createProfessional,
  unique,
} from "./support/api";
import { goToMonth } from "./support/calendar";
import { businessDay } from "./support/dates";
import { shown } from "./support/patient-name";

const pad = (n: number) => String(n).padStart(2, "0");

/** Um profissional só do teste isola o recorte e evita conflito de horário com outros specs. */
async function seedAgenda(request: Parameters<typeof createPatient>[0]) {
  const professional = await createProfessional(request, { fullName: `Enf. Filtro ${unique()}` });
  const patient = await createPatient(request, { fullName: `Paciente Filtro ${unique()}` });
  // Longe das seeds de horário dos outros specs: com profissional x sem profissional, o conflito é global (AGE-RN-02).
  const day = businessDay(120);
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
  const scheduled = await make(9);
  const confirmed = await make(10);
  await changeAppointmentStatus(request, confirmed.id, "confirm");
  const completed = await make(11);
  await completeAppointment(request, completed.id);
  const noShow = await make(12);
  await changeAppointmentStatus(request, noShow.id, "no_show");
  const cancelled = await make(13);
  await changeAppointmentStatus(request, cancelled.id, "cancel");
  return { professional, patient, day, scheduled, confirmed, completed, noShow, cancelled };
}

const chip = (page: import("@playwright/test").Page, name: RegExp) =>
  page.getByRole("button", { name });

test.describe("agenda: filtro por status (#538)", () => {
  test("padrão esconde canceladas, multisseleção e recorte na URL", async ({ page, request }) => {
    const seed = await seedAgenda(request);
    const name = shown(seed.patient.fullName);
    const appt = (hour: number) => page.getByRole("button", { name: `${pad(hour)}:00 ${name}`, exact: true });

    await page.goto("/agenda");
    await page.getByLabel("Filtrar por profissional").selectOption(seed.professional.id);
    await goToMonth(page, seed.day);

    await expect(appt(9)).toBeVisible();
    await expect(appt(10)).toBeVisible();
    await expect(appt(11)).toBeVisible();
    // A célula do mês mostra 3 consultas por dia: o resto vai para "+N". O padrão
    // não pode trazer a cancelada; ela só aparece quando o chip é marcado (abaixo).
    await expect(appt(13)).toHaveCount(0);
    // A contagem inclui o que o padrão esconde.
    await expect(chip(page, /^Cancelada, 1 consulta$/)).toBeVisible();
    await expect(chip(page, /^Agendada, 1 consulta$/)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, /^Cancelada, 1 consulta$/)).toHaveAttribute("aria-pressed", "false");

    // Multisseleção: só Confirmada e Faltou.
    await chip(page, /^Agendada/).click();
    await chip(page, /^Concluída/).click();
    await expect(appt(9)).toHaveCount(0);
    await expect(appt(11)).toHaveCount(0);
    await expect(appt(10)).toBeVisible();
    await expect(appt(12)).toBeVisible();
    await expect(page).toHaveURL(/status=confirmed%2Cno_show|status=confirmed,no_show/);

    // Marcar só a Cancelada traz apenas ela.
    await chip(page, /^Confirmada/).click();
    await chip(page, /^Faltou/).click();
    await chip(page, /^Cancelada/).click();
    await expect(appt(13)).toBeVisible();
    await expect(appt(10)).toHaveCount(0);
    await expect(page).toHaveURL(/status=cancelled/);
    await chip(page, /^Cancelada/).click();
    await chip(page, /^Confirmada/).click();
    await chip(page, /^Faltou/).click();

    // Recarregar preserva o recorte.
    await page.reload();
    await expect(chip(page, /^Confirmada/)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, /^Agendada/)).toHaveAttribute("aria-pressed", "false");
  });

  test("nenhum status marcado mostra 'Mostrar padrão'; valor inválido cai no padrão", async ({ page }) => {
    await page.goto("/agenda?status=");
    await expect(page.getByText("Nenhum status marcado.")).toBeVisible();
    await page.getByRole("button", { name: "Mostrar padrão" }).click();
    await expect(chip(page, /^Agendada/)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, /^Cancelada/)).toHaveAttribute("aria-pressed", "false");
    await expect(page).not.toHaveURL(/status=/);

    await page.goto("/agenda?status=xyz");
    await expect(chip(page, /^Agendada/)).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, /^Cancelada/)).toHaveAttribute("aria-pressed", "false");
  });

  for (const width of [360, 390]) {
    test(`sem rolagem horizontal da página em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/agenda");
      await expect(chip(page, /^Agendada/)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
