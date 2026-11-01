import { expect, test } from "@playwright/test";
import { createAppointment, createPatient, createProfessional, unique } from "./support/api";
import { businessDay } from "./support/dates";

const pad = (n: number) => String(n).padStart(2, "0");

// Ao trocar de semana a grade não pode sumir nem herdar as consultas da anterior (#588):
// enquanto a busca corre, as colunas ficam no lugar, marcadas como ocupadas, e sem «Nenhuma consulta».
for (const width of [768, 1280]) {
  test(`trocar de semana mantém as colunas durante a busca, sem consultas antigas (${width}px)`, async ({
    page,
    request,
  }) => {
    const professional = await createProfessional(request, { fullName: `Enf. Carrega ${unique()}` });
    const patient = await createPatient(request, { fullName: `Paciente Carrega ${unique()}` });
    const day = businessDay(1);
    const date = `${day.year}-${pad(day.month)}-${pad(day.day)}`;
    await createAppointment(request, {
      patientId: patient.id,
      startsAt: `${date}T09:00:00-03:00`,
      endsAt: `${date}T09:30:00-03:00`,
      procedure: "Curativo semana",
      priceCents: 10000,
      professionalId: professional.id,
    });

    await page.setViewportSize({ width, height: 900 });
    // O período vem da URL (#551): abre direto na semana da consulta.
    await page.goto(`/agenda?visao=semana&dia=${date}&profissional=${professional.id}`);
    await expect(page.locator("[data-week-day]")).toHaveCount(7);
    const block = page.locator("button[title]");
    await expect(block).toHaveCount(1);

    // A próxima busca fica pendurada até o teste liberá-la.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // A leitura mora no servidor (#551): quem fica pendurada é a resposta da navegação (RSC).
    await page.route(/\/agenda\?.*_rsc=/, async (route) => {
      if (route.request().headers()["next-router-prefetch"]) {
        await route.continue();
        return;
      }
      await gate;
      await route.continue();
    });

    await page.getByRole("button", { name: "Próxima semana" }).click();

    await expect(page.locator("[data-week-day]")).toHaveCount(7);
    await expect(page.locator('[aria-busy="true"]').filter({ has: page.locator("[data-week-day]") })).toHaveCount(1);
    await expect(page.locator("button[title]")).toHaveCount(0);
    await expect(page.getByText(/Nenhuma consulta/)).toHaveCount(0);

    release();
    await expect(page.locator('[aria-busy="true"]').filter({ has: page.locator("[data-week-day]") })).toHaveCount(0);
    await expect(page.locator("[data-week-day]")).toHaveCount(7);
    await expect(page.getByText(/Nenhuma consulta/)).toHaveCount(1);
  });
}
