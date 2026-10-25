import { expect, test } from "@playwright/test";
import { goToMonth } from "./support/calendar";
import { businessDay } from "./support/dates";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: { year: number; month: number; day: number }) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

// Visão Dia aberta a partir do mês (#589): no celular o mês compacto tem dia marcado e a visão
// Dia abre nele; no desktop o mês não tem dia marcado, então vale o dia 1 do mês (hoje, no mês atual).
test.describe("agenda: Mês → Dia abre no dia escolhido (#589)", () => {
  test("celular (360px): marcar um dia no mês e tocar em Dia abre nesse dia", async ({ page }) => {
    const day = businessDay(200);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/agenda");
    await goToMonth(page, day);

    await page.locator(`[data-day="${keyOf(day)}"]`).click();
    await page.getByRole("group", { name: "Visão da agenda" }).getByRole("button", { name: "Dia" }).click();

    await expect(page.locator("[data-week-day]")).toHaveCount(1);
    await expect(page.locator(`[data-week-day="${keyOf(day)}"]`)).toBeVisible();
  });

  test("celular (360px): sem marcar nenhum dia, Dia abre no dia 1 do mês distante", async ({ page }) => {
    const day = businessDay(200);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/agenda");
    await goToMonth(page, day);

    await page.getByRole("group", { name: "Visão da agenda" }).getByRole("button", { name: "Dia" }).click();

    await expect(page.locator(`[data-week-day="${day.year}-${pad(day.month)}-01"]`)).toBeVisible();
  });

  test("desktop (1280px): Mês → Dia e Mês → Semana abrem no dia 1 do mês distante", async ({ page }) => {
    const day = businessDay(200);
    const first = `${day.year}-${pad(day.month)}-01`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/agenda");
    await goToMonth(page, day);

    const views = page.getByRole("group", { name: "Visão da agenda" });
    await views.getByRole("button", { name: "Dia" }).click();
    await expect(page.locator(`[data-week-day="${first}"]`)).toBeVisible();
    await expect(page.locator("[data-week-day]")).toHaveCount(1);

    await views.getByRole("button", { name: "Mês" }).click();
    await views.getByRole("button", { name: "Semana" }).click();
    await expect(page.locator(`[data-week-day="${first}"]`)).toBeVisible();
    await expect(page.locator("[data-week-day]")).toHaveCount(7);
  });
});
