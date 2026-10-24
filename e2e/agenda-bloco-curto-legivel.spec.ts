import { expect, test } from "@playwright/test";
import { createAppointment, createPatient } from "./support/api";
import { businessDay, saoPauloIso } from "./support/dates";

// Consultas de 15, 30, 45 e 60 min num dia sem outros agendamentos (#539). Em 768 px o
// `.sv-btn` do Still Void impunha 44 px de altura e inflava o bloco; em 1280 px o texto de
// duas linhas era cortado na vertical.
const SLOTS: [number, number, number, number][] = [
  [8, 0, 8, 15],
  [8, 30, 9, 0],
  [9, 15, 9, 30],
  [10, 0, 10, 45],
  [11, 15, 12, 15],
];
const HOUR_PX = 56;

for (const width of [768, 1280]) {
  test(`blocos curtos legíveis na visão semanal em ${width}px (#539)`, async ({ page, request }) => {
    const day = businessDay(width === 768 ? 35 : 42);
    const key = `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
    const patient = await createPatient(request, { fullName: `Meire Saraiva ${Date.now()}` });
    for (const [h1, m1, h2, m2] of SLOTS) {
      await createAppointment(request, {
        patientId: patient.id,
        startsAt: saoPauloIso(day, h1, m1),
        endsAt: saoPauloIso(day, h2, m2),
        procedure: "Troca de bolsa de estomia",
        priceCents: 10000,
      });
    }

    await page.setViewportSize({ width, height: 900 });
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Semana", exact: true }).click();
    const column = page.locator(`[data-week-day="${key}"]`);
    for (let attempt = 0; attempt < 10 && (await column.count()) === 0; attempt++) {
      await page.getByRole("button", { name: "Próxima semana" }).click();
    }
    await expect(column.locator("button[title]")).toHaveCount(SLOTS.length);

    const problems = await column.locator("button[title]").evaluateAll((blocks, hourPx) => {
      return blocks.flatMap((block) => {
        const rect = block.getBoundingClientRect();
        const match = (block.getAttribute("title") ?? "").match(/^(\d\d):(\d\d)–(\d\d):(\d\d)/);
        const minutes = match ? Number(match[3]) * 60 + Number(match[4]) - (Number(match[1]) * 60 + Number(match[2])) : 0;
        const found: string[] = [];
        if (rect.height > (minutes / 60) * hourPx + 1.5) found.push(`inflado: ${Math.round(rect.height)}px para ${minutes} min`);
        for (const span of block.querySelectorAll("span")) {
          if (span.scrollHeight > span.clientHeight + 1 || span.getBoundingClientRect().bottom > rect.bottom + 0.5) {
            found.push(`texto cortado: ${block.getAttribute("title")}`);
          }
        }
        const after = getComputedStyle(block, "::after");
        if (minutes < 30 && Number.parseFloat(after.height) < 24) found.push(`área de toque ${after.height} abaixo de 24px`);
        return found;
      });
    }, HOUR_PX);
    expect(problems).toEqual([]);
  });
}
