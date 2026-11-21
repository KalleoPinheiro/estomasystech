import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Campos de data e hora no celular (#969, #970): o campo nativo de data/hora tem
 * largura mínima própria (no Safari do iOS, maior que a coluna de 100px) e,
 * dentro de grade ou formulário estreito, invadia o campo vizinho ou passava da
 * tela. Cada teste mede as caixas no navegador nas quatro larguras do projeto.
 */

const WIDTHS = [360, 390, 768, 1280] as const;

type Box = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  expect(found).not.toBeNull();
  return found as Box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * Largura que o campo pede para mostrar o valor inteiro (dia/mês/ano, hora e o
 * ícone): uma cópia fora do fluxo com `width: max-content`. Menor que isso, o
 * navegador corta o valor ("/2030", "0 PM") ou o campo transborda a coluna.
 */
async function intrinsicWidth(field: Locator): Promise<number> {
  return field.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLInputElement;
    clone.value = (el as HTMLInputElement).value;
    clone.style.cssText = "position:absolute;visibility:hidden;width:max-content;min-width:0;max-width:none";
    el.parentElement?.appendChild(clone);
    const width = clone.getBoundingClientRect().width;
    clone.remove();
    return width;
  });
}

/** O campo cabe no contêiner e mostra o valor inteiro, sem cortar. */
async function expectFieldFits(field: Locator, container: Locator): Promise<void> {
  const f = await box(field);
  const c = await box(container);
  expect(f.x).toBeGreaterThanOrEqual(c.x - 0.5);
  expect(f.x + f.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  expect(f.width).toBeGreaterThanOrEqual((await intrinsicWidth(field)) - 0.5);
}

test.describe("campos de data e hora no celular (#969, #970)", () => {
  for (const width of WIDTHS) {
    test(`Nova consulta: Data, Início e Duração não se sobrepõem (${width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/agenda");
      await page.getByRole("button", { name: "+ Nova consulta" }).click();
      const dialog = page.getByRole("dialog", { name: "Nova consulta" });
      await expect(dialog).toBeVisible();

      const date = dialog.getByLabel("Data *");
      const start = dialog.getByLabel("Início *");
      const duration = dialog.getByLabel("Duração *");
      await date.fill("2030-03-15");
      await start.fill("14:30");
      await dialog.screenshot({ path: testInfo.outputPath(`nova-consulta-${width}.png`) });

      const fields = [date, start, duration];
      const boxes = await Promise.all(fields.map(box));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i] as Box, boxes[j] as Box)).toBe(false);
        }
      }
      const form = dialog.locator("form");
      for (const field of fields) {
        await expectFieldFits(field, form);
      }
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    });

    test(`Paciente: Data de nascimento cabe no formulário (${width}px)`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/pacientes");
      await page.getByRole("button", { name: "+ Novo paciente" }).click();
      const dialog = page.getByRole("dialog", { name: "Novo paciente" });
      await expect(dialog).toBeVisible();

      const birth = dialog.getByLabel("Data de nascimento");
      await birth.fill("1958-07-21");
      await birth.scrollIntoViewIfNeeded();
      await birth.locator("xpath=..").screenshot({ path: testInfo.outputPath(`nascimento-${width}.png`) });

      await expectFieldFits(birth, dialog.locator("form"));
      const b = await box(birth);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});
