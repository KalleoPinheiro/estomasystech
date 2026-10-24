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

test.describe("Configurações em sub-rotas (#522)", () => {
  for (const viewport of [...MOBILE_WIDTHS, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    test(`índice curto, sem rolagem horizontal e com acesso a cada seção (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/configuracoes");
      await settle(page);
      const indice = page.locator("nav#indice-secoes");
      await expect(indice).toBeVisible();
      expect(await indice.getByRole("link").count()).toBeGreaterThanOrEqual(6);
      const { altura, largura, janela } = await page.evaluate(() => ({
        altura: document.documentElement.scrollHeight,
        largura: document.documentElement.scrollWidth,
        janela: window.innerWidth,
      }));
      // Antes eram ~8.400 px numa página só em 360 px.
      expect(altura).toBeLessThan(2000);
      expect(largura).toBeLessThanOrEqual(janela);
    });
  }

  test("tocar numa seção abre a sub-rota e «Voltar ao índice» volta (360px)", async ({ page }) => {
    await page.setViewportSize(MOBILE_WIDTHS[0]);
    await page.goto("/configuracoes");
    await settle(page);
    await page.locator("nav#indice-secoes").getByRole("link", { name: "Privacidade" }).or(
      page.locator("nav#indice-secoes").getByRole("link", { name: "Contato de privacidade" }),
    ).first().click();
    await expect(page).toHaveURL(/\/configuracoes\/privacidade$/);
    await settle(page);
    await page.getByRole("link", { name: "Voltar ao índice" }).click();
    await expect(page).toHaveURL(/\/configuracoes$/);
  });

  test("a rolagem da página não vira rolagem interna do conteúdo (1280px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/configuracoes/contas");
    await settle(page);
    const overflow = await page
      .locator("main")
      .first()
      .evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflow).not.toBe("auto");
    expect(overflow).not.toBe("scroll");
  });

  test("link antigo com âncora leva à sub-rota da seção", async ({ page }) => {
    await page.goto("/configuracoes#horarios");
    await expect(page).toHaveURL(/\/configuracoes\/horarios$/);
    await settle(page);
    await expect(page.getByRole("heading", { name: "Grade de horários" })).toBeVisible();
  });

  test("retorno do OAuth do Google vai para Google Agenda com os parâmetros", async ({ page }) => {
    await page.goto("/configuracoes?calendar=erro&reason=acesso_negado");
    await expect(page).toHaveURL(/\/configuracoes\/google-agenda\?calendar=erro&reason=acesso_negado$/);
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
