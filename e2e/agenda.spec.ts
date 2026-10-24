import { test, expect } from "@playwright/test";
import { createAppointment, createPatient } from "./support/api";
import { expectToast } from "./support/assertions";
import { DEFAULT_SCHEDULE_CONFIG } from "./support/constants";
import { goToMonth } from "./support/calendar";
import { businessDay, slotForAttempt, outsideBusinessHoursSlot } from "./support/dates";
import { pickPatient } from "./support/patient-picker";
import { shown } from "./support/patient-name";

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: describe agrupa 6 fluxos e2e independentes da agenda
test.describe("agenda", () => {
  test("agenda uma consulta em dia útil e horário comercial", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Agenda ${Date.now()}` });
    const slot = slotForAttempt("agenda-happy-path");

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();

    await pickPatient(page, patient.fullName);
    await page.getByLabel("Data *").fill(slot.dateInput);
    await page.getByLabel("Início *").fill(slot.startTimeInput);
    await page.getByLabel("Procedimento *").fill("Troca de bolsa — E2E");
    await page.getByLabel("Valor (R$) *").fill("150");
    await page.getByRole("button", { name: "Agendar consulta" }).click();

    await expect(page.getByRole("heading", { name: "Nova consulta" })).not.toBeVisible();

    await goToMonth(page, slot.ymd);
    await expect(
      page.getByRole("button", { name: `${slot.startTimeInput} ${shown(patient.fullName)}`, exact: true }),
    ).toBeVisible();
  });

  test("link do Google Agenda abre os detalhes da consulta no mês dela (#217)", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { fullName: `Paciente Link ${Date.now()}` });
    const slot = slotForAttempt("agenda-deep-link");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      procedure: "Curativo — link",
      priceCents: 10000,
    });

    await page.goto(
      `/agenda?consulta=${appointment.id}&em=${encodeURIComponent(slot.startsAt)}`,
    );

    await expect(page.getByRole("heading", { name: "Detalhes da consulta" })).toBeVisible();
    await expect(page.getByText("Curativo — link")).toBeVisible();
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
    await pickPatient(page, patientB.fullName);
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
    await pickPatient(page, patient.fullName);
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
      .getByRole("button", { name: `${original.startTimeInput} ${shown(patient.fullName)}`, exact: true })
      .click();

    await expect(page.getByRole("heading", { name: "Detalhes da consulta" })).toBeVisible();
    await page.getByRole("button", { name: "Remarcar", exact: true }).click();
    await page.getByLabel("Nova data").fill(target.dateInput);
    await page.getByLabel("Novo horário").fill(target.startTimeInput);
    await page.getByRole("button", { name: "Confirmar remarcação" }).click();

    await expect(page.getByRole("heading", { name: "Detalhes da consulta" })).not.toBeVisible();

    await goToMonth(page, target.ymd);
    await expect(
      page.getByRole("button", { name: `${target.startTimeInput} ${shown(patient.fullName)}`, exact: true }),
    ).toBeVisible();
  });

  test("cria série recorrente semanal", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Serie ${Date.now()}` });
    const slot = slotForAttempt("agenda-recurring");

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();
    await pickPatient(page, patient.fullName);
    await page.getByLabel("Repetição").selectOption({ label: "Semanal — 4 sessões" });
    await page.getByLabel("Data *").fill(slot.dateInput);
    await page.getByLabel("Início *").fill(slot.startTimeInput);
    await page.getByLabel("Procedimento *").fill("Sessão semanal — E2E");
    await page.getByLabel("Valor (R$) *").fill("120");
    await page.getByRole("button", { name: "Agendar consulta" }).click();

    await expect(page.getByText(/Série criada: 4 sessões\./)).toBeVisible();
  });

  test("grade de horários é configurável em /configuracoes", async ({ page, request }) => {
    await page.goto("/configuracoes/horarios");
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Grade de horários" })).toBeVisible();

    await page.getByLabel("Abre (h)").fill("10");
    await page.getByLabel("Fecha (h)").fill("12");
    await page.getByRole("button", { name: "Salvar grade" }).click();
    await expectToast(page, /Grade salva/);

    try {
      const patient = await createPatient(request, { fullName: `Paciente Grade ${Date.now()}` });
      const day = businessDay(10);

      // 08:00 estava dentro da grade padrão, mas fica fora da nova janela (10h–12h).
      await page.goto("/agenda");
      await page.getByRole("button", { name: "+ Nova consulta" }).click();
      await pickPatient(page, patient.fullName);
      await page.getByLabel("Data *").fill(
        `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`,
      );
      await page.getByLabel("Início *").fill("08:00");
      await page.getByLabel("Procedimento *").fill("Fora da grade custom");
      await page.getByLabel("Valor (R$) *").fill("100");
      await page.getByRole("button", { name: "Agendar consulta" }).click();
      // Só o alerta de erro: a dica do formulário também descreve a grade e,
      // já recarregada, repete "10:00 às 12:00" (modo estrito do Playwright).
      await expect(page.getByText(/Atendimento somente em:.*10:00 às 12:00/)).toBeVisible();

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
