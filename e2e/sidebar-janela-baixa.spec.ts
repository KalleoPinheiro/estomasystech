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
