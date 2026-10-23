import { expect, test } from "@playwright/test";

/**
 * Menu lateral (#482, QA da staging): Tema e Sair sempre à vista em janela
 * baixa e sem barra de rolagem horizontal sob «Minha conta». Mobile first.
 */
test.describe("menu lateral em janela baixa", () => {
  test("celular 360x640: Sair cabe no menu e o menu não rola na horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/agenda");
    await page.locator("button[aria-expanded]").first().click();

    const sair = page.getByRole("button", { name: "Sair" });
    await expect(sair).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  });

  for (const height of [600, 802]) {
    test(`desktop 1265x${height}: Tema e Sair à vista sem rolar a página`, async ({ page }) => {
      await page.setViewportSize({ width: 1265, height });
      await page.goto("/agenda");

      await expect(page.getByRole("button", { name: "Sair" })).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
    });
  }
});

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const overflowing = await page.evaluate(() =>
    [...document.querySelectorAll("aside *")].filter((el) => {
      const e = el as HTMLElement;
      const ox = getComputedStyle(e).overflowX;
      return (ox === "auto" || ox === "scroll") && e.scrollWidth > e.clientWidth + 1;
    }).length,
  );
  expect(overflowing).toBe(0);
}

test.describe("gaveta do menu em celular baixo (#524)", () => {
  for (const height of [568, 640, 740]) {
    test(`360x${height}: rodapé fixo, lista rola e nada se sobrepõe`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height });
      await page.goto("/agenda");
      await page.locator("button[aria-expanded]").first().click();

      const sair = page.getByRole("button", { name: "Sair" });
      const minhaConta = page.getByRole("link", { name: "Minha conta" });
      await expect(sair).toBeInViewport({ ratio: 1 });

      // Sem sobrepor: o item mais baixo da lista termina antes do rodapé.
      await minhaConta.scrollIntoViewIfNeeded();
      await expect(minhaConta).toBeInViewport({ ratio: 1 });
      const link = await minhaConta.boundingBox();
      const exit = await sair.boundingBox();
      expect(link && exit && link.y + link.height <= exit.y).toBe(true);
    });
  }

  test("360x568: a lista avisa com fade que há itens abaixo", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 568 });
    await page.goto("/agenda");
    await page.locator("button[aria-expanded]").first().click();

    const fade = await page.locator(".scroll-fade").evaluate((el) => (el as HTMLElement).style.getPropertyValue("--fade-bottom"));
    expect(fade).toBe("1.5rem");
  });
});
