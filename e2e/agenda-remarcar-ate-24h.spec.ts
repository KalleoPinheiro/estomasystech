import { expect, test } from "@playwright/test";
import { createAppointment, createPatient, unique } from "./support/api";
import { goToMonth } from "./support/calendar";
import { DEFAULT_SCHEDULE_CONFIG } from "./support/constants";
import { businessDay } from "./support/dates";
import { shown } from "./support/patient-name";

const pad = (n: number) => String(n).padStart(2, "0");

/** Grade aberta o dia todo, sem almoço: a consulta das 23:00 termina às 24:00. */
const ALL_DAY = { ...DEFAULT_SCHEDULE_CONFIG, startHour: 0, endHour: 24, lunchBreak: null };

test.describe("agenda: consulta que termina às 24:00 (#580)", () => {
  // O horário vale no fuso da clínica, não no do navegador.
  for (const [index, timezoneId] of ["America/Sao_Paulo", "America/Manaus", "Asia/Tokyo"].entries()) {
    test.describe(`navegador em ${timezoneId}`, () => {
      test.use({ timezoneId });

      test("remarcar para as 23:00 com 60 min é aceito", async ({ page, request }) => {
        await request.put("/api/settings/schedule", { data: ALL_DAY });
        try {
          const patient = await createPatient(request, { fullName: `Paciente Meia-noite ${unique()}` });
          const day = businessDay(170 + index * 7);
          const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
          await createAppointment(request, {
            patientId: patient.id,
            startsAt: `${date}T10:00:00-03:00`,
            endsAt: `${date}T11:00:00-03:00`,
            procedure: "Curativo à noite",
            priceCents: 10000,
          });

          await page.goto("/agenda");
          await goToMonth(page, day);
          await page
            .getByRole("button", { name: `10:00 ${shown(patient.fullName)}`, exact: true })
            .click();
          await page.getByRole("button", { name: "Remarcar", exact: true }).click();
          await page.getByLabel("Nova data").fill(date);
          await page.getByLabel("Novo horário").fill("23:00");
          await page.getByRole("button", { name: "Confirmar remarcação" }).click();

          await expect(page.getByRole("heading", { name: "Detalhes da consulta" })).not.toBeVisible();
          await expect(
            page.getByRole("button", { name: `23:00 ${shown(patient.fullName)}`, exact: true }),
          ).toBeVisible();
        } finally {
          await request.put("/api/settings/schedule", { data: DEFAULT_SCHEDULE_CONFIG });
        }
      });
    });
  }
});
