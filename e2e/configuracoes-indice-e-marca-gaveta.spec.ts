import { expect, type Page, test } from "@playwright/test";

/**
 * #534 e #535: o jsdom não calcula `sticky` nem largura de conteúdo, então a
 * prova de layout é medida no navegador (360/390 celular, 768 tablet, 1280 desktop).
 */

const MOBILE_WIDTHS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  await expect(page.locator(".sv-skeleton:visible")).toHaveCount(0, { timeout: 20_000 });
}

test.describe("índice de Configurações fixo ao rolar (#534)", () => {
  for (const viewport of [...MOBILE_WIDTHS, { width: 768, height: 1024 }]) {
    test(`índice continua à vista depois de rolar (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/configuracoes");
      await settle(page);
      const indice = page.locator("nav#indice-secoes");
      await expect(indice).toBeVisible();
      for (const y of [400, 1500, 4000]) {
        // A página é mais curta em telas largas: rola até o teto quando y passa dele.
        const alvo = await page.evaluate((to) => {
          const max = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, Math.min(to, max));
          return Math.min(to, max);
        }, y);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(alvo - 5);
        const top = await indice.evaluate((el) => el.getBoundingClientRect().top);
        expect(top, `scrollY ${y}`).toBeGreaterThanOrEqual(-1);
        expect(top, `scrollY ${y}`).toBeLessThanOrEqual(1);
      }
    });
  }

  test("âncora do índice não fica atrás da faixa fixa (360px)", async ({ page }) => {
    await page.setViewportSize(MOBILE_WIDTHS[0]);
    await page.goto("/configuracoes");
    await settle(page);
    await page.locator("nav#indice-secoes a[href='#privacidade']").click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const gap = await page.evaluate(() => {
      const faixa = document.querySelector("nav#indice-secoes")!.getBoundingClientRect();
      const secao = document.querySelector("#privacidade")!.getBoundingClientRect();
      return secao.top - faixa.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  test("a rolagem da página não vira rolagem interna do conteúdo (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/configuracoes");
    await settle(page);
    const overflow = await page
      .locator("main")
      .first()
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflow).not.toBe("auto");
    expect(overflow).not.toBe("scroll");
  });
});

test.describe("marca inteira na gaveta do menu (#535)", () => {
  for (const viewport of MOBILE_WIDTHS) {
    test(`marca sem corte e sem rolagem horizontal (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await settle(page);
      await page.locator("button[aria-expanded]").first().click();
      const area = page.getByRole("dialog").locator(".scroll-fade");
      await expect(area).toBeVisible();
      const report = await area.evaluate((el) => {
        const marca = el.querySelector("a.sv-logo") ?? el.querySelector("a");
        const box = el.getBoundingClientRect();
        const m = marca!.getBoundingClientRect();
        return {
          scroll: el.scrollWidth,
          client: el.clientWidth,
          marcaRight: m.right,
          areaRight: box.right,
        };
      });
      expect(report.scroll).toBeLessThanOrEqual(report.client);
      expect(report.marcaRight).toBeLessThanOrEqual(report.areaRight);
    });
  }

  test("barra lateral do desktop mostra a marca inteira (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await settle(page);
    const area = page.locator(".scroll-fade").first();
    const report = await area.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(report.scroll).toBeLessThanOrEqual(report.client);
  });
});
