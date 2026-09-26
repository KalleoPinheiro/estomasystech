import type { Page } from "@playwright/test";
import type { YMD } from "./slots";

const PT_MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * Navega o calendário mensal até o mês/ano alvo (o form de criação usa <input type="date">
 * direto, então só precisamos navegar o mês pra CONFERIR o agendamento no grid).
 *
 * Lê o rótulo do mês exibido na tela (ex.: "dezembro de 2026") em vez de assumir que o
 * calendário sempre começa no mês corrente — a função é chamada mais de uma vez no mesmo
 * teste (ex.: antes e depois de remarcar), e na segunda chamada o mês exibido já não é
 * mais "hoje".
 */
export async function goToMonth(page: Page, target: YMD): Promise<void> {
  const label = await page.getByText(/ de \d{4}$/).textContent();
  const match = label?.match(/^(\p{L}+) de (\d{4})$/u);
  if (!match) {
    throw new Error(`Rótulo de mês não reconhecido: "${label}"`);
  }
  const [, monthName, yearText] = match;
  const currentMonth = PT_MONTHS.indexOf(monthName.toLowerCase());
  const currentYear = Number(yearText);
  const delta = (target.year - currentYear) * 12 + (target.month - 1 - currentMonth);
  if (delta === 0) {
    return;
  }
  const button = page.getByRole("button", { name: delta >= 0 ? "Próximo mês" : "Mês anterior" });
  for (let i = 0; i < Math.abs(delta); i++) {
    await button.click();
  }
}
