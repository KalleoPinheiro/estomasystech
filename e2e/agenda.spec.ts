import { test, expect, type Page } from "@playwright/test";
import { createAppointment, createPatient } from "./support/api";
import { DEFAULT_SCHEDULE_CONFIG } from "./support/constants";
import { businessDay, slotForAttempt, outsideBusinessHoursSlot, type YMD } from "./support/dates";

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
async function goToMonth(page: Page, target: YMD): Promise<void> {
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: describe agrupa 6 fluxos e2e independentes da agenda
test.describe("agenda", () => {
  test("agenda uma consulta em dia útil e horário comercial", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Agenda ${Date.now()}` });
    const slot = slotForAttempt("agenda-happy-path");

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();

    await page.getByLabel("Paciente *").selectOption({ label: patient.fullName });
    await page.getByLabel("Data *").fill(slot.dateInput);
    await page.getByLabel("Início *").fill(slot.startTimeInput);
    await page.getByLabel("Procedimento *").fill("Troca de bolsa — E2E");
    await page.getByLabel("Valor (R$) *").fill("150");
    await page.getByRole("button", { name: "Agendar consulta" }).click();

    await expect(page.getByRole("heading", { name: "Nova consulta" })).not.toBeVisible();

    await goToMonth(page, slot.ymd);
    await expect(
      page.getByRole("button", { name: `${slot.startTimeInput} ${patient.fullName}`, exact: true }),
    ).toBeVisible();
  });

  test("bloqueia conflito de horário (intervalo mínimo entre consultas)", async ({
    page,
    request,
  }) => {
    const patientA = await createPatient(request);
    const patientB = await createPatient(request);
    const slot = slotForAttempt("agenda-conflict");

    await createAppointment(request, {
      patientId: patientA.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      procedure: "Consulta original",
      priceCents: 10000,
    });

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();
    await page.getByLabel("Paciente *").selectOption({ label: patientB.fullName });
    await page.getByLabel("Data *").fill(slot.dateInput);
    await page.getByLabel("Início *").fill(slot.startTimeInput);
    await page.getByLabel("Procedimento *").fill("Consulta conflitante");
    await page.getByLabel("Valor (R$) *").fill("100");
    await page.getByRole("button", { name: "Agendar consulta" }).click();

    await expect(page.getByText(/Horário indisponível/i)).toBeVisible();
    // Modal permanece aberto — o agendamento não foi criado.
    await expect(page.getByRole("heading", { name: "Nova consulta" })).toBeVisible();
  });

  test("bloqueia agendamento fora do horário comercial", async ({ page, request }) => {
    const patient = await createPatient(request);
    const slot = outsideBusinessHoursSlot("agenda-outside-hours");

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();
    await page.getByLabel("Paciente *").selectOption({ label: patient.fullName });
    await page.getByLabel("Data *").fill(slot.dateInput);
    await page.getByLabel("Início *").fill(slot.startTimeInput);
    await page.getByLabel("Procedimento *").fill("Fora do horário");
    await page.getByLabel("Valor (R$) *").fill("100");
    await page.getByRole("button", { name: "Agendar consulta" }).click();

    await expect(page.getByText(/Atendimento somente em/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nova consulta" })).toBeVisible();
  });

  test("remarca uma consulta existente", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Remarcar ${Date.now()}` });
    const original = slotForAttempt("agenda-reschedule-original");
    const target = slotForAttempt("agenda-reschedule-target");

    await createAppointment(request, {
      patientId: patient.id,
      startsAt: original.startsAt,
      endsAt: original.endsAt,
      procedure: "Consulta a remarcar",
      priceCents: 10000,
    });

    await page.goto("/agenda");
    await goToMonth(page, original.ymd);
    await page
      .getByRole("button", { name: `${original.startTimeInput} ${patient.fullName}`, exact: true })
      .click();

    await expect(page.getByRole("heading", { name: "Detalhes da consulta" })).toBeVisible();
    await page.getByRole("button", { name: "Remarcar", exact: true }).click();
    await page.getByLabel("Nova data").fill(target.dateInput);
    await page.getByLabel("Novo horário").fill(target.startTimeInput);
    await page.getByRole("button", { name: "Confirmar remarcação" }).click();

    await expect(page.getByRole("heading", { name: "Detalhes da consulta" })).not.toBeVisible();

    await goToMonth(page, target.ymd);
    await expect(
      page.getByRole("button", { name: `${target.startTimeInput} ${patient.fullName}`, exact: true }),
    ).toBeVisible();
  });

  test("cria série recorrente semanal", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Serie ${Date.now()}` });
    const slot = slotForAttempt("agenda-recurring");

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();
    await page.getByLabel("Paciente *").selectOption({ label: patient.fullName });
    await page.getByLabel("Repetição").selectOption({ label: "Semanal — 4 sessões" });
    await page.getByLabel("Data *").fill(slot.dateInput);
    await page.getByLabel("Início *").fill(slot.startTimeInput);
    await page.getByLabel("Procedimento *").fill("Sessão semanal — E2E");
    await page.getByLabel("Valor (R$) *").fill("120");
    await page.getByRole("button", { name: "Agendar consulta" }).click();

    await expect(page.getByText(/Série criada: 4 sessões\./)).toBeVisible();
  });

  test("grade de horários é configurável em /configuracoes", async ({ page, request }) => {
    await page.goto("/configuracoes");
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Grade de horários" })).toBeVisible();

    await page.getByLabel("Abre (h)").fill("10");
    await page.getByLabel("Fecha (h)").fill("12");
    await page.getByRole("button", { name: "Salvar grade" }).click();
    // Toast e a região de notificações (aria-live) duplicam o mesmo texto para
    // leitores de tela — .first() pega o toast visível, não o anúncio sr-only
    // (mesmo padrão de e2e/portal-paciente.spec.ts).
    await expect(page.getByText(/Grade salva/).first()).toBeVisible();

    try {
      const patient = await createPatient(request, { fullName: `Paciente Grade ${Date.now()}` });
      const day = businessDay(10);

      // 08:00 estava dentro da grade padrão, mas fica fora da nova janela (10h–12h).
      await page.goto("/agenda");
      await page.getByRole("button", { name: "+ Nova consulta" }).click();
      await page.getByLabel("Paciente *").selectOption({ label: patient.fullName });
      await page.getByLabel("Data *").fill(
        `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`,
      );
      await page.getByLabel("Início *").fill("08:00");
      await page.getByLabel("Procedimento *").fill("Fora da grade custom");
      await page.getByLabel("Valor (R$) *").fill("100");
      await page.getByRole("button", { name: "Agendar consulta" }).click();
      await expect(page.getByText(/10:00 às 12:00/)).toBeVisible();

      // 10:30 está dentro da nova janela — deve funcionar.
      await page.getByLabel("Início *").fill("10:30");
      await page.getByRole("button", { name: "Agendar consulta" }).click();
      await expect(page.getByRole("heading", { name: "Nova consulta" })).not.toBeVisible();
    } finally {
      // Restaura a grade padrão — outros specs assumem 08:00–18:00 seg-sex.
      await request.put("/api/settings/schedule", { data: DEFAULT_SCHEDULE_CONFIG });
    }
  });
});
