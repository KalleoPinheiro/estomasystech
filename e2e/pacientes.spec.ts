import { test, expect } from "@playwright/test";
import { createPatient, unique } from "./support/api";
import { literal, rx } from "./support/regexp";

test.describe("pacientes", () => {
  test("cria um paciente pela UI", async ({ page }) => {
    const name = `Paciente Criado UI ${unique()}`;
    await page.goto("/pacientes");
    await page.getByRole("button", { name: "+ Novo paciente" }).click();
    await page.getByLabel("Nome completo *").fill(name);
    await page.getByLabel("Email (opcional)").fill(`${unique()}@e2e.vittaflow.test`);
    await page.getByLabel("Telefone *").fill("11977776666");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: "Novo paciente" })).not.toBeVisible();
    await expect(page.getByRole("cell", { name })).toBeVisible();
  });

  test("cria um paciente sem e-mail, e outro com o mesmo e-mail de contato (#325)", async ({ page }) => {
    const shared = `${unique()}@e2e.vittaflow.test`;
    const names = [`Sem Email UI ${unique()}`, `Familiar A UI ${unique()}`, `Familiar B UI ${unique()}`];
    await page.goto("/pacientes");
    for (const [index, name] of names.entries()) {
      await page.getByRole("button", { name: "+ Novo paciente" }).click();
      await page.getByLabel("Nome completo *").fill(name);
      if (index > 0) {
        await page.getByLabel("Email (opcional)").fill(shared);
      }
      await page.getByLabel("Telefone *").fill("11977776666");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByRole("cell", { name })).toBeVisible();
    }
  });

  test("cadastra o responsável na ficha e o termo de consentimento sai com o nome dele (#329)", async ({ page, request }) => {
    const patient = await createPatient(request);
    const guardianName = `Responsável E2E ${unique()}`;

    await page.goto(`/pacientes/${patient.id}`);
    await page.getByRole("button", { name: "Vincular responsável" }).click();
    await page.getByRole("button", { name: "Cadastrar novo responsável" }).click();
    await page.getByLabel("Nome completo *").fill(guardianName);
    await page.getByLabel("Parentesco *").selectOption("filho");
    await page.getByLabel("Telefone *").fill("(11) 97777-6666");
    await page.getByRole("button", { name: "Salvar" }).click();

    const panel = page.locator("[data-guardian-panel]");
    await expect(panel).toContainText(guardianName);
    await expect(panel).toContainText("Filho(a)");
    await expect(panel).toContainText("(11) 97777-6666");

    await page.goto(`/documentos/consentimento/${patient.id}`);
    await expect(page.getByText(`Responsável legal: ${guardianName}`)).toBeVisible();
  });

  test("telefone sem DDD é recusado com motivo e com máscara é guardado formatado", async ({ page }) => {
    const name = `Paciente Telefone UI ${unique()}`;
    await page.goto("/pacientes");
    await page.getByRole("button", { name: "+ Novo paciente" }).click();
    await page.getByLabel("Nome completo *").fill(name);
    await page.getByLabel("Email (opcional)").fill(`${unique()}@e2e.vittaflow.test`);
    await page.getByLabel("Telefone *").fill("99999-0000");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Informe o DDD junto com o número")).toBeVisible();

    await page.getByLabel("Telefone *").fill("(011) 97777-6666");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("heading", { name: "Novo paciente" })).not.toBeVisible();
    await expect(page.getByRole("row", { name: literal(name) })).toContainText("(11) 97777-6666");
  });

  test("edita um paciente existente", async ({ page, request }) => {
    const patient = await createPatient(request);
    const newName = `${patient.fullName} (editado)`;

    await page.goto("/pacientes");
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(patient.fullName);
    await expect(page.getByRole("cell", { name: patient.fullName })).toBeVisible();

    await page
      .getByRole("row", { name: literal(patient.fullName) })
      .getByRole("button", { name: "Editar" })
      .click();
    await page.getByLabel("Nome completo *").fill(newName);
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("heading", { name: "Editar paciente" })).not.toBeVisible();
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(newName);
    await expect(page.getByRole("cell", { name: newName })).toBeVisible();
  });

  test("inativa um paciente e bloqueia novo agendamento para ele", async ({ page, request }) => {
    const patient = await createPatient(request);

    await page.goto("/pacientes");
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(patient.fullName);
    await page
      .getByRole("row", { name: literal(patient.fullName) })
      .getByRole("button", { name: "Desativar" })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(
      page.getByRole("row", { name: literal(patient.fullName) }).getByText("Inativo"),
    ).toBeVisible();

    // Paciente inativo não aparece no seletor de novo agendamento.
    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();
    await page.getByLabel("Paciente *").fill(patient.fullName);
    await expect(page.getByText("Nenhum paciente encontrado.")).toBeVisible();

    // Defesa em profundidade: a API também recusa agendar para paciente inativo.
    const response = await request.post("/api/appointments", {
      data: {
        patientId: patient.id,
        startsAt: "2027-03-01T15:00:00.000Z",
        endsAt: "2027-03-01T16:00:00.000Z",
        procedure: "Tentativa bloqueada",
        priceCents: 1000,
      },
    });
    expect(response.ok()).toBe(false);
    const body = await response.json();
    expect(body.error).toContain("inativo");
  });

  test("busca pacientes por nome", async ({ page, request }) => {
    const target = await createPatient(request, { fullName: `Busca Alvo ${unique()}` });
    await createPatient(request, { fullName: `Outro Paciente ${unique()}` });

    await page.goto("/pacientes");
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(target.fullName);

    await expect(page.getByRole("cell", { name: target.fullName })).toBeVisible();
  });

  test("abre o prontuário do paciente", async ({ page, request }) => {
    const patient = await createPatient(request);

    await page.goto("/pacientes");
    await page.getByPlaceholder("Buscar por nome, email ou telefone…").fill(patient.fullName);
    await page
      .getByRole("row", { name: literal(patient.fullName) })
      .getByRole("link", { name: "Prontuário" })
      .click();

    await expect(page).toHaveURL(rx`/pacientes/${patient.id}`);
    await expect(page.getByRole("heading", { name: patient.fullName })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Anamnese", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Estomias e feridas" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Evoluções (SOAP)" })).toBeVisible();
  });
});
