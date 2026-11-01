import { test, expect } from "@playwright/test";
import {
  completeAppointment,
  createAppointment,
  createPatient,
  createProcedure,
  createProfessional,
  unique,
} from "./support/api";
import { civilToday, monthsFromCivilToday } from "./support/calendar";
import { slotForAttempt } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";
import { literal } from "./support/regexp";

const monthValue = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, "0")}`;

/** Nº de meses entre "hoje" e o mês alvo (positivo = alvo no futuro). */
function monthsFromNow(value: string): number {
  const [year, month] = value.split("-").map(Number);
  return monthsFromCivilToday(year, month);
}

/**
 * A página não tem mais `<input type="month">` (achado REL-02 — mês vira texto
 * pt-BR + navegação ‹›). Chega no mês pedido clicando "Próximo mês"/"Mês
 * anterior" a quantidade de vezes necessária, uma navegação por clique.
 */
async function setReportMonth(page: import("@playwright/test").Page, value: string): Promise<void> {
  const delta = monthsFromNow(value);
  const step = delta >= 0 ? 1 : -1;
  const buttonLabel = delta >= 0 ? "Próximo mês" : "Mês anterior";
  const button = page.getByRole("link", { name: buttonLabel });
  const now = civilToday();

  for (let i = 1; i <= Math.abs(delta); i += 1) {
    const target = new Date(now.year, now.month0 + step * i, 1);
    const targetValue = monthValue(target.getFullYear(), target.getMonth() + 1);
    // O mês vai na URL e o servidor renderiza a página de novo (#555): espera a URL do mês.
    await button.click();
    await page.waitForURL(new RegExp(`month=${targetValue}$`), { timeout: 20_000 });
  }
}

test.describe("relatório gerencial", () => {
  test("consulta concluída aparece na receita e margem por procedimento do mês", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { fullName: `Paciente Relatório ${unique()}` });
    const procedure = await createProcedure(request, {
      name: `Procedimento Relatório E2E ${unique()}`,
      priceCents: 22000,
      durationMinutes: 45,
    });
    const slot = slotForAttempt("relatorios-margem-2");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure: procedure.name,
      priceCents: procedure.priceCents,
      procedureId: procedure.id,
    });
    await completeAppointment(request, appointment.id);

    await page.goto("/relatorios");
    await setReportMonth(page, monthValue(slot.ymd.year, slot.ymd.month));

    const row = page.getByRole("row", { name: literal(procedure.name) });
    await expect(row).toBeVisible();
    await expect(row.getByText("R$ 220,00").first()).toBeVisible();
  });

  test("produção por profissional soma consultas concluídas vinculadas", async ({
    page,
    request,
  }) => {
    const professional = await createProfessional(request, {
      fullName: `Enf. Relatório E2E ${unique()}`,
    });
    const patient = await createPatient(request, { fullName: `Paciente Produção ${unique()}` });
    const slot = slotForAttempt("relatorios-producao");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure: `Sessão com profissional E2E ${unique()}`,
      priceCents: 9000,
      professionalId: professional.id,
    });
    await completeAppointment(request, appointment.id);

    await page.goto("/relatorios");
    await setReportMonth(page, monthValue(slot.ymd.year, slot.ymd.month));

    const row = page.getByRole("row", { name: literal(professional.fullName) });
    await expect(row).toBeVisible();
    await expect(row.getByText("R$ 90,00")).toBeVisible();
  });

  test("mês sem consultas concluídas mostra estado vazio", async ({ page }) => {
    const today = civilToday();
    const future = new Date(today.year, today.month0 + 37, 1);

    await page.goto("/relatorios");
    await setReportMonth(page, monthValue(future.getFullYear(), future.getMonth() + 1));

    await expect(page.getByText("Nenhuma consulta concluída no mês.")).toBeVisible();
    await expect(page.getByText("Consultas no mês")).toBeVisible();
  });
});
