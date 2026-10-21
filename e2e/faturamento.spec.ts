import { test, expect } from "@playwright/test";
import {
  completeAppointment,
  createAppointment,
  createInvoice,
  createPatient,
  createProcedure,
  getPackagesByPatient,
  payInvoice,
  unique,
} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { literal } from "./support/regexp";
import { pickPatient } from "./support/patient-picker";
import { shown } from "./support/patient-name";

test.describe("faturamento", () => {
  test("concluir consulta gera fatura pendente", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Fatura ${unique()}` });
    const slot = slotForAttempt("faturamento-complete");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      procedure: `Procedimento Faturável ${unique()}`,
      priceCents: 23400,
    });
    await completeAppointment(request, appointment.id);

    await page.goto("/faturamento");
    await page.getByRole("button", { name: "Pendentes" }).click();
    const row = page.getByRole("row", { name: literal(shown(patient.fullName)) });
    await expect(row).toBeVisible();
    await expect(row.getByText("R$ 234,00")).toBeVisible();
  });

  test("recebe pagamento de uma fatura pendente (pix)", async ({ page, request }) => {
    const patient = await createPatient(request);
    await createInvoice(request, {
      patientId: patient.id,
      description: `Sessão avulsa ${unique()}`,
      amountCents: 15000,
    });

    await page.goto("/faturamento");
    const row = page.getByRole("row", { name: literal(shown(patient.fullName)) });
    await row.getByRole("button", { name: "Receber" }).click();
    await expect(page.getByRole("heading", { name: "Registrar pagamento" })).toBeVisible();
    await page.getByRole("button", { name: "Pix", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Registrar pagamento" })).not.toBeVisible();
    await page.getByRole("button", { name: "Pagas" }).click();
    await expect(page.getByRole("row", { name: literal(shown(patient.fullName)) })).toContainText(
      "Pix",
    );
  });

  test("recebe parte da fatura, dá desconto e quita o saldo", async ({ page, request }) => {
    const patient = await createPatient(request);
    await createInvoice(request, {
      patientId: patient.id,
      description: `Sessão parcelada ${unique()}`,
      amountCents: 20000,
    });

    await page.goto("/faturamento");
    const row = page.getByRole("row", { name: literal(shown(patient.fullName)) });

    // Recebe R$ 50 de R$ 200: continua pendente, com saldo.
    await row.getByRole("button", { name: "Receber" }).click();
    await page.getByLabel("Valor recebido (R$)").fill("50");
    await page.getByRole("button", { name: "Pix", exact: true }).click();
    await expect(row).toContainText("falta R$ 150,00");
    await expect(row.getByRole("link", { name: "Recibo" })).toBeVisible();

    // Desconto de R$ 20 com motivo: saldo cai para R$ 130.
    await row.getByRole("button", { name: "Desconto" }).click();
    await page.getByLabel("Desconto (R$)").fill("20");
    await page.getByLabel("Motivo *").fill("Fidelidade");
    await page.getByRole("button", { name: "Aplicar desconto" }).click();
    await expect(row).toContainText("falta R$ 130,00");

    // Quita o saldo em dinheiro.
    await row.getByRole("button", { name: "Receber" }).click();
    await page.getByRole("button", { name: "Dinheiro", exact: true }).click();
    await page.getByRole("button", { name: "Pagas" }).click();
    const paidRow = page.getByRole("row", { name: literal(shown(patient.fullName)) });
    await expect(paidRow.getByRole("link", { name: "Recibo" })).toHaveCount(2);
  });

  test("recibo exige CPF do paciente e traz CPF e CNPJ quando há", async ({
    page,
    request,
  }) => {
    const pay = async (cpf?: string) => {
      const patient = await createPatient(request, cpf ? { cpf } : {});
      const invoice = await createInvoice(request, {
        patientId: patient.id,
        description: `Recibo CPF ${unique()}`,
        amountCents: 9000,
      });
      const paid = await payInvoice(request, invoice.id, "pix");
      return `/documentos/recibo/${paid.id}/${paid.payments[0].id}`;
    };

    await page.goto(await pay());
    await expect(page.getByText(/não tem CPF cadastrado/)).toBeVisible();

    await page.goto(await pay("529.982.247-25"));
    await expect(page.getByText(/CPF 529\.982\.247-25/)).toBeVisible();
    await expect(page.getByText(/CNPJ /)).toBeVisible();
  });

  test("bloqueia cancelamento de fatura já paga", async ({ page, request }) => {
    const patient = await createPatient(request);
    const invoice = await createInvoice(request, {
      patientId: patient.id,
      description: `Sessão paga ${unique()}`,
      amountCents: 9000,
    });
    await payInvoice(request, invoice.id, "cash");

    const response = await request.patch(`/api/invoices/${invoice.id}`, {
      data: { action: "cancel" },
    });
    expect(response.ok()).toBe(false);
    const body = await response.json();
    expect(body.error).toContain("paid");

    await page.goto("/faturamento");
    await page.getByRole("button", { name: "Pagas" }).click();
    const row = page.getByRole("row", { name: literal(shown(patient.fullName)) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: "Cancelar" })).toHaveCount(0);
  });

  test("pacote pré-pago consome sessão sem gerar nova fatura ao concluir", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { fullName: `Paciente Pacote ${unique()}` });
    const procedure = await createProcedure(request, { name: `Procedimento Pacote ${unique()}` });

    await page.goto("/faturamento");
    await page.getByRole("button", { name: "Vender pacote" }).click();
    await pickPatient(page, patient.fullName);
    await page.getByLabel("Procedimento *").selectOption({ label: procedure.name });
    await page.getByLabel("Sessões *").fill("5");
    await page.getByLabel("Preço total (R$) *").fill("500");
    // Dois botões com o mesmo texto na página (o que abre o modal e o de submit) — o
    // de submit é o último no DOM, dentro do modal.
    await page.getByRole("button", { name: "Vender pacote", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "Vender pacote de sessões" })).not.toBeVisible();

    const [pkg] = await getPackagesByPatient(request, patient.id);
    expect(pkg.remainingSessions).toBe(5);

    const slot = slotForAttempt("faturamento-package-session");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      procedure: procedure.name,
      priceCents: procedure.priceCents,
      procedureId: procedure.id,
    });
    await completeAppointment(request, appointment.id);

    const [pkgAfter] = await getPackagesByPatient(request, patient.id);
    expect(pkgAfter.remainingSessions).toBe(4);
    expect(pkgAfter.usedSessions).toBe(1);

    // A sessão do pacote não deve ter gerado uma nova fatura pendente separada.
    // A venda do pacote emite fatura própria ("Pacote: <procedimento> (N sessões)"),
    // então casar o nome do paciente com o do procedimento pega as duas — a
    // distinção é a célula de descrição: a fatura da consulta usa o nome do
    // procedimento puro.
    await page.goto("/faturamento");
    await page.getByRole("button", { name: "Pendentes" }).click();
    const pendingRowsForPatient = page.getByRole("row", {
      name: literal(shown(patient.fullName)),
    });
    const packageSaleInvoice = pendingRowsForPatient.filter({
      has: page.getByRole("cell", {
        name: `Pacote: ${procedure.name} (5 sessões)`,
        exact: true,
      }),
    });
    const appointmentInvoice = pendingRowsForPatient.filter({
      has: page.getByRole("cell", { name: procedure.name, exact: true }),
    });
    // Âncora: a fatura da venda continua pendente — sem ela, o toHaveCount(0)
    // abaixo passaria por lista vazia em vez de por comportamento correto.
    await expect(packageSaleInvoice).toHaveCount(1);
    await expect(appointmentInvoice).toHaveCount(0);
  });
});
