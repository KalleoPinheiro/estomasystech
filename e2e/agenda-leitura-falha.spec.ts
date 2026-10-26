import { expect, test } from "@playwright/test";
import { createAppointment, createPatient, createProfessional, unique } from "./support/api";
import { goToMonth } from "./support/calendar";
import { businessDay } from "./support/dates";
import { shown } from "./support/patient-name";

/**
 * #578 / #551: a leitura da agenda mora no servidor. Aqui ela falha DE VERDADE no servidor (gancho
 * `ESTOMASYSTECH_E2E_FAULTS` + cookie `e2e-fault`, ver `src/lib/server/test-faults.ts`) e a pessoa vê o alerta no
 * lugar da grade, com «Tentar de novo» que refaz a leitura.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const BASE_URL = "http://localhost:3000";

async function seed(request: Parameters<typeof createPatient>[0]) {
  const professional = await createProfessional(request, { fullName: `Enf. Leitura ${unique()}` });
  const patient = await createPatient(request, { fullName: `Paciente Leitura ${unique()}` });
  const day = businessDay(160);
  const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
  await createAppointment(request, {
    patientId: patient.id,
    startsAt: `${date}T09:00:00-03:00`,
    endsAt: `${date}T09:30:00-03:00`,
    procedure: "Curativo leitura",
    priceCents: 10000,
    professionalId: professional.id,
  });
  return { professional, patient, day };
}

function gridEntry(page: import("@playwright/test").Page, width: number, day: number, label: string) {
  return width < 768
    ? page.getByRole("button", { name: `${day}, com consultas`, exact: true })
    : page.getByRole("button", { name: label, exact: true });
}

const fault = (reads: string) => ({ name: "e2e-fault", value: reads, url: BASE_URL });

test.describe("agenda: leitura que falha no servidor (#578)", () => {
  for (const width of [360, 1280]) {
    test(`consultas falham: alerta no lugar da grade e «Tentar de novo» traz a agenda (${width}px)`, async ({
      page,
      request,
    }) => {
      const s = await seed(request);
      const name = shown(s.patient.fullName);
      const date = `${s.day.year}-${pad(s.day.month)}-${pad(s.day.day)}`;
      await page.setViewportSize({ width, height: 900 });
      await page.context().addCookies([fault("consultas")]);

      await page.goto(`/agenda?dia=${date}&profissional=${s.professional.id}`);

      const alert = page.getByRole("alert").filter({ hasText: "Não foi possível carregar as consultas." });
      await expect(alert).toBeVisible();
      await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toHaveCount(0);

      await page.context().clearCookies({ name: "e2e-fault" });
      await page.getByRole("button", { name: "Tentar de novo" }).click();

      await expect(alert).toHaveCount(0);
      await goToMonth(page, s.day);
      await expect(gridEntry(page, width, s.day.day, `09:00 ${name}`)).toBeVisible();
    });
  }

  test("a contagem falha: alerta, chips com «—» e a grade continua à vista", async ({ page, request }) => {
    const s = await seed(request);
    const name = shown(s.patient.fullName);
    const date = `${s.day.year}-${pad(s.day.month)}-${pad(s.day.day)}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.context().addCookies([fault("contagem")]);

    await page.goto(`/agenda?dia=${date}&profissional=${s.professional.id}`);

    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar as consultas." })).toBeVisible();
    await expect(gridEntry(page, 1280, s.day.day, `09:00 ${name}`)).toBeVisible();
  });
});
