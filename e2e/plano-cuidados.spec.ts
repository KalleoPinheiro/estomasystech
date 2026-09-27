import { test, expect } from "@playwright/test";
import { addCarePlanDiagnosis, createCarePlan, createCondition, createPatient, unique, linkPortalAccount} from "./support/api";
import { sessionCookie } from "./support/session-token";

async function openCarePlanTab(page: import("@playwright/test").Page, patientId: string) {
  await page.goto(`/pacientes/${patientId}`);
  await page.getByRole("tab", { name: /Plano de Cuidados \(SAE\)/ }).click();
}

test.describe("plano de cuidados (SAE)", () => {
  test("percorre o ciclo completo: diagnóstico → resultado → intervenção → execução → avaliação atinge a meta", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request);
    const title = `Lesão sacral E2E ${unique()}`;
    await createCondition(request, patient.id, { kind: "wound", title });

    await openCarePlanTab(page, patient.id);
    await page.getByRole("button", { name: "+ Novo plano" }).click();
    await page.getByLabel("Condição associada").selectOption({ label: title });
    await page.getByRole("button", { name: "Abrir plano" }).click();

    const planCard = page.locator("li", { hasText: title });
    await expect(planCard).toBeVisible();
    await planCard.getByRole("button", { name: "Ver plano" }).click();

    // Diagnóstico NANDA-I no formato PES
    await page.getByRole("button", { name: "+ Diagnóstico" }).click();
    await page.getByLabel("Buscar diagnóstico (NANDA-I)").fill("pele");
    await page.getByText(/Integridade da pele prejudicada/).click();
    await page.getByLabel("Relacionado a (etiologia)").fill("Umidade excessiva por exsudato");
    await page
      .getByLabel("Evidenciado por (características definidoras)")
      .fill("Ruptura da epiderme");
    await page.getByRole("button", { name: "Prescrever diagnóstico" }).click();
    await expect(
      page.getByText(/relacionado a Umidade excessiva por exsudato, evidenciado por Ruptura da epiderme/),
    ).toBeVisible();

    // Resultado NOC — sugestão já vem ligada ao diagnóstico prescrito
    await page.getByRole("button", { name: "+ Resultado" }).click();
    await page.getByText(/Integridade tissular: pele e mucosas/).click();
    await page.getByLabel("Pontuação basal (1–5)").fill("2");
    await page.getByLabel("Meta (1–5)").fill("4");
    await page.getByRole("button", { name: "Prescrever resultado" }).click();
    await expect(page.getByText("Basal 2")).toBeVisible();
    await expect(page.getByText("Atual —")).toBeVisible();

    // Intervenção NIC
    await page.getByRole("button", { name: "+ Intervenção" }).click();
    await page.getByText(/Cuidados com lesões/).click();
    await page.getByLabel("Frequência *").fill("A cada troca de placa");
    await page.getByRole("button", { name: "Prescrever intervenção" }).click();
    await expect(page.getByText(/A cada troca de placa/)).toBeVisible();

    // Implementação — registra execução da intervenção
    await page.getByRole("button", { name: "Registrar execução" }).click();
    await expect(page.getByText(/Última execução:/)).toBeVisible();

    // Avaliação — atinge a meta (score 4)
    await page.getByRole("button", { name: "Avaliar" }).click();
    await page.getByText("4 — Levemente comprometido").click();
    await page.getByRole("button", { name: "Registrar avaliação" }).click();
    await expect(page.getByText("Atual 4")).toBeVisible();
    await expect(page.getByText("Meta atingida")).toBeVisible();
  });

  test("reavaliação com piora exibe regressão em vez de progresso", async ({ page, request }) => {
    const patient = await createPatient(request);
    await openCarePlanTab(page, patient.id);

    await page.getByRole("button", { name: "+ Novo plano" }).click();
    await page.getByRole("button", { name: "Abrir plano" }).click();
    await expect(page.getByText("Plano geral do paciente")).toBeVisible();
    await page.getByRole("button", { name: "Ver plano" }).click();

    await page.getByRole("button", { name: "+ Diagnóstico" }).click();
    await page.getByLabel("Buscar diagnóstico (NANDA-I)").fill("pele");
    await page.getByText(/Integridade da pele prejudicada/).click();
    await page.getByLabel("Relacionado a (etiologia)").fill("Umidade excessiva");
    await page.getByLabel("Evidenciado por (características definidoras)").fill("Ruptura da epiderme");
    await page.getByRole("button", { name: "Prescrever diagnóstico" }).click();

    await page.getByRole("button", { name: "+ Resultado" }).click();
    await page.getByText(/Integridade tissular: pele e mucosas/).click();
    await page.getByLabel("Pontuação basal (1–5)").fill("2");
    await page.getByLabel("Meta (1–5)").fill("4");
    await page.getByRole("button", { name: "Prescrever resultado" }).click();

    await page.getByRole("button", { name: "Avaliar" }).click();
    await page.getByText("1 — Gravemente comprometido").click();
    await page.getByRole("button", { name: "Registrar avaliação" }).click();

    await expect(page.getByText("Atual 1")).toBeVisible();
    await expect(page.getByText("Em regressão")).toBeVisible();
  });

  test("meta menor ou igual à basal é bloqueada; diagnóstico sem seleção mostra erro", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request);
    await openCarePlanTab(page, patient.id);

    await page.getByRole("button", { name: "+ Novo plano" }).click();
    await page.getByRole("button", { name: "Abrir plano" }).click();
    await expect(page.getByText("Plano geral do paciente")).toBeVisible();
    await page.getByRole("button", { name: "Ver plano" }).click();

    await page.getByRole("button", { name: "+ Diagnóstico" }).click();
    await page.getByRole("button", { name: "Prescrever diagnóstico" }).click();
    await expect(page.getByText("Selecione um diagnóstico do catálogo")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "+ Resultado" }).click();
    await page.getByLabel("Buscar resultado (NOC)").fill("tissular");
    await page.getByText(/Integridade tissular: pele e mucosas/).click();
    await page.getByLabel("Pontuação basal (1–5)").fill("3");
    await page.getByLabel("Meta (1–5)").fill("3");
    await page.getByRole("button", { name: "Prescrever resultado" }).click();
    await expect(page.getByText(/Meta deve ser maior que a pontuação basal/)).toBeVisible();
  });

  test("plano resolvido fica somente-leitura", async ({ page, request }) => {
    const patient = await createPatient(request);
    await openCarePlanTab(page, patient.id);

    await page.getByRole("button", { name: "+ Novo plano" }).click();
    await page.getByRole("button", { name: "Abrir plano" }).click();
    await expect(page.getByText("Plano geral do paciente")).toBeVisible();
    await page.getByRole("button", { name: "Ver plano" }).click();
    await expect(page.getByRole("button", { name: "Resolver plano" })).toBeVisible();

    await page.getByRole("button", { name: "Resolver plano" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Resolvido")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Diagnóstico" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "+ Resultado" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "+ Intervenção" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Resolver plano" })).not.toBeVisible();
  });
});

test.describe("plano de cuidados (SAE) — limite staff × portal", () => {
  test("portal do paciente não expõe dados do plano de cuidados (SAE)", async ({ page, context, request }) => {
    const patient = await createPatient(request);
    const plan = await createCarePlan(request, patient.id);
    await addCarePlanDiagnosis(request, plan.id, {
      diagnosisCode: "00046",
      type: "real",
      relatedFactors: "Umidade excessiva",
      definingCharacteristics: "Ruptura da epiderme",
    });
    await linkPortalAccount(request, "patient", patient);
    await context.addCookies([sessionCookie(patient.email, "patient")]);

    await page.goto("/portal");
    await expect(page.getByText(`Olá, ${patient.fullName.split(" ")[0]}!`)).toBeVisible();
    await expect(page.getByText(/Plano de Cuidados/)).toHaveCount(0);
    await expect(page.getByText(/NANDA/)).toHaveCount(0);
    await expect(page.getByText(/Integridade da pele prejudicada/)).toHaveCount(0);
    await expect(page.getByText(/Ruptura da epiderme/)).toHaveCount(0);
  });
});
