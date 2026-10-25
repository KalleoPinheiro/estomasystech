import { expect, test } from "@playwright/test";
import { createAppointment, createPatient, createProfessional, unique } from "./support/api";
import { goToMonth } from "./support/calendar";
import { businessDay } from "./support/dates";
import { shown } from "./support/patient-name";

const pad = (n: number) => String(n).padStart(2, "0");

const STATUS_CHIPS = [/^Agendada/, /^Confirmada/, /^Concluída/, /^Faltou/, /^Cancelada/];

test.describe("agenda no celular: chips de status e seletor Mês/Dia (#582)", () => {
  for (const width of [360, 390]) {
    test(`os 5 chips ficam visíveis, sem rolagem, e o seletor traz Mês e Dia (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/agenda");

      const filter = page.getByRole("group", { name: "Filtrar por status" });
      await expect(filter).toBeVisible();
      for (const name of STATUS_CHIPS) {
        const chip = filter.getByRole("button", { name });
        await expect(chip).toBeVisible();
        const box = await chip.boundingBox();
        expect(box).not.toBeNull();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
      const clipped = await filter.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(clipped).toBeLessThanOrEqual(0);

      const views = page.getByRole("group", { name: "Visão da agenda" });
      await expect(views.getByRole("button", { name: "Mês" })).toBeVisible();
      await expect(views.getByRole("button", { name: "Dia" })).toBeVisible();
      await expect(views.getByRole("button", { name: "Semana" })).toHaveCount(0);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("Dia no celular mostra a visão de um dia só, com a consulta, e Mês volta ao mês compacto", async ({
    page,
    request,
  }) => {
    const professional = await createProfessional(request, { fullName: `Enf. Celular ${unique()}` });
    const patient = await createPatient(request, { fullName: `Paciente Celular ${unique()}` });
    const day = businessDay(180);
    const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
    await createAppointment(request, {
      patientId: patient.id,
      startsAt: `${date}T09:00:00-03:00`,
      endsAt: `${date}T09:30:00-03:00`,
      procedure: "Curativo celular",
      priceCents: 10000,
      professionalId: professional.id,
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/agenda");
    await page.getByLabel("Filtrar por profissional").selectOption(professional.id);
    await goToMonth(page, day);
    await expect(page.locator("[data-mobile-month]")).toBeVisible();

    await page.getByRole("button", { name: "Dia", exact: true }).click();
    await expect(page.getByRole("button", { name: "Dia", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-mobile-month]")).toHaveCount(0);
    // O período do dia: a navegação passa a andar de dia em dia.
    await expect(page.getByRole("button", { name: "Próximo dia" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await expect(page.locator("[data-mobile-month]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Próximo mês" })).toBeVisible();
    // A consulta segue acessível pelo dia no mês compacto.
    await page.locator(`[data-mobile-month] [data-day="${date}"]`).click();
    await expect(page.locator("[data-day-list]").getByText(shown(patient.fullName))).toBeVisible();
  });
});
