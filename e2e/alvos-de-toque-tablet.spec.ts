import { expect, type Page, test } from "@playwright/test";

/**
 * Alvos de toque no tablet (#519, #520): a regra de 44px do Still Void para em
 * 40rem, e a 768px (sem ponteiro grosso) botão, campo, aba e link voltavam a
 * 36–40px. O `globals.css` estende a conta até 64rem. Mede caixas no navegador
 * nas telas da equipe, com a sessão padrão do E2E (Admin da clínica).
 */

const TABLET = { width: 768, height: 1024 } as const;
const MIN_TOUCH_PX = 44;
// Tolerância de subpixel: 43.98px não é um alvo pequeno.
const TOLERANCE = 0.5;

const TELAS = [
  { nome: "Hoje", rota: "/" },
  { nome: "Agenda", rota: "/agenda" },
  { nome: "Faturamento", rota: "/faturamento" },
  { nome: "Configurações", rota: "/configuracoes" },
  { nome: "Pacientes", rota: "/pacientes" },
];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await expect(page.locator(".sv-skeleton:visible")).toHaveCount(0, { timeout: 20_000 });
}

async function tooSmallControls(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ min, tolerance }) => {
      const root = document.querySelector("body") as HTMLElement;
      return Array.from(
        root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea"),
      )
        .filter((el) => el.checkVisibility({ visibilityProperty: true }))
        .map((el) => {
          // Checkbox/radio: o alvo de toque é o rótulo que o envolve.
          const isToggle = el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type);
          const r = (isToggle ? (el.closest("label") ?? el) : el).getBoundingClientRect();
          const name =
            el.getAttribute("aria-label") ??
            el.getAttribute("placeholder") ??
            (el.textContent ?? "").trim().slice(0, 40);
          return { name: `<${el.tagName.toLowerCase()}> ${name}`, w: r.width, h: r.height };
        })
        .filter((b) => b.w > 0 && b.h > 0 && (b.w < min - tolerance || b.h < min - tolerance))
        .map((b) => `${b.name} (${Math.round(b.w)}x${Math.round(b.h)})`);
    },
    { min: MIN_TOUCH_PX, tolerance: TOLERANCE },
  );
}

test.use({ viewport: TABLET });

test.describe("alvos de toque no tablet (768px)", () => {
  for (const tela of TELAS) {
    test(`${tela.nome}: nenhum controle abaixo de 44px`, async ({ page }) => {
      await page.goto(tela.rota);
      await settle(page);
      expect(await tooSmallControls(page), `controles < 44px em ${tela.rota}`).toEqual([]);
    });
  }

  test("modal Nova consulta: botão Fechar com 44x44px", async ({ page }) => {
    await page.goto("/agenda");
    await settle(page);
    await page.getByRole("button", { name: /nova consulta/i }).first().click();
    const fechar = page.getByRole("button", { name: "Fechar" });
    await expect(fechar).toBeVisible();
    const box = await fechar.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(MIN_TOUCH_PX - TOLERANCE);
    expect(box?.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX - TOLERANCE);
  });
});
