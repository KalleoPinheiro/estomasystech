import { expect, type Locator, type Page, test } from "@playwright/test";
import { createPatient, unique } from "./support/api";
import { shown } from "./support/patient-name";

/**
 * #1009: na lista de pacientes, Prontuário, Editar e Desativar/Reativar ficam numa
 * linha só, inteiros na área visível da tabela, nas quatro larguras da validação
 * padrão. A validação do #971 mediu a 3ª ação quebrando para outra linha (360, 390,
 * 1280) e a coluna Ações fora da tela em 768.
 */

const WIDTHS = [360, 390, 768, 1280] as const;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("elemento sem caixa: não está visível");
  }
  return box;
}

async function expectOneLineInView(page: Page, name: string, toggle: string, width: number) {
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: shown(name) }) });
  const group = row.getByTestId("patient-row-actions");
  const actions = [
    group.getByRole("link", { name: "Prontuário" }),
    group.getByRole("button", { name: "Editar" }),
    group.getByRole("button", { name: toggle }),
  ];
  const boxes = await Promise.all(actions.map(boxOf));
  const centers = boxes.map((box) => box.y + box.height / 2);
  for (const center of centers) {
    expect(Math.abs(center - centers[0]), `ações em linhas diferentes em ${width}px`).toBeLessThanOrEqual(2);
  }

  const groupBox = await boxOf(group);
  expect(groupBox.x, `ações começam fora da tela em ${width}px`).toBeGreaterThanOrEqual(0);
  expect(groupBox.x + groupBox.width, `ações passam da tela em ${width}px`).toBeLessThanOrEqual(width);

  // Sem rolagem lateral na página nem dentro da tabela (em 768 o corte era na tabela).
  const overflow = await page.evaluate(() => {
    const table = document.querySelector("table");
    const scroller = table?.parentElement;
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      table: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
    };
  });
  expect(overflow.page, `rolagem lateral na página em ${width}px`).toBeLessThanOrEqual(0);
  expect(overflow.table, `rolagem lateral na tabela em ${width}px`).toBeLessThanOrEqual(0);
}

test.describe("pacientes: ações da linha numa linha só (#1009)", () => {
  test("ativo e inativo, com e-mail longo, nas quatro larguras", async ({ page, request }) => {
    const id = unique();
    const activeName = `Acoes Linha Ativo ${id}`;
    const inactiveName = `Acoes Linha Inativo ${id}`;
    // E-mail do tamanho dos da homologação, o que alargava a tabela em 768.
    await createPatient(request, {
      fullName: activeName,
      email: `alexandre.costa.27.${id}@homologacao.invalid`,
    });
    const inactive = await createPatient(request, {
      fullName: inactiveName,
      email: `aline.nogueira.18.${id}@homologacao.invalid`,
    });
    const deactivated = await request.patch(`/api/patients/${inactive.id}`, { data: { active: false } });
    expect(deactivated.ok()).toBeTruthy();

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, toggle] of [
        [activeName, "Desativar"],
        [inactiveName, "Reativar"],
      ] as const) {
        await page.goto(`/pacientes`);
        await page.getByRole("searchbox").fill(name);
        await expect(page.getByRole("cell", { name: shown(name) })).toBeVisible();
        await expectOneLineInView(page, name, toggle, width);
      }
    }
  });
});
