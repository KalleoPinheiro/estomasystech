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
 * Mês civil de hoje no fuso do app (APP_TIMEZONE, ADR-073), não no do processo do teste.
 * Das 21h à meia-noite em São Paulo o relógio UTC do runner já está no dia (e, no último
 * dia do mês, no mês) seguinte: contar meses com `new Date().getMonth()` desalinhava o
 * clique em "Próximo mês" do mês que a tela mostra.
 */
export function civilToday(
  now: Date = new Date(),
  timeZone: string = process.env.APP_TIMEZONE ?? "America/Sao_Paulo",
): { year: number; month0: number } {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const [year, month] = key.split("-").map(Number);
  return { year, month0: month - 1 };
}

/** Nº de meses entre o mês civil de hoje e `year`/`month` (1–12); positivo = no futuro. */
export function monthsFromCivilToday(
  year: number,
  month: number,
  now: Date = new Date(),
  timeZone?: string,
): number {
  const today = civilToday(now, timeZone);
  return (year - today.year) * 12 + (month - 1 - today.month0);
}

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
