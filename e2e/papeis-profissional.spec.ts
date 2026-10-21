import { test, expect, type Page } from "@playwright/test";
import { abbreviatePatientName } from "../src/lib/patient-name";
import { createCondition, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { goToMonth } from "./support/calendar";
import { slotFromSeed } from "./support/dates";
import { roleStorageState, trackApiFailures } from "./support/roles";
import { loadSeedData } from "./support/seed-data";

/**
 * Fluxos clínicos com a sessão real do Profissional (#189, #204). O vínculo R4
 * com o paciente semeado nasce da consulta atribuída a ele no `global-setup`
 * (o mesmo caminho da recepção). Antes, a busca NANDA/NOC/NIC respondia 403 e
 * a SAE só funcionava como Admin — o E2E passava porque rodava como Super Admin.
 */
test.use({ storageState: roleStorageState("profissional") });

const SEED_PROFESSIONAL = "Enf. Semente E2E";

async function openRecord(page: Page, tab: RegExp): Promise<void> {
  const { linkedPatientId, linkedPatientName } = loadSeedData();
  await page.goto(`/pacientes/${linkedPatientId}`);
  await expect(page.getByRole("heading", { name: linkedPatientName })).toBeVisible();
  await page.getByRole("tab", { name: tab }).click();
}

test.describe("profissional", () => {
  test("profissional vê o paciente semeado pelo vínculo", async ({ page }) => {
    const { linkedPatientName } = loadSeedData();
    const failures = trackApiFailures(page);

    // A lista do Profissional só traz pacientes vinculados (R4).
    await page.goto("/pacientes");
    await page.getByRole("row", { name: new RegExp(abbreviatePatientName(linkedPatientName)) }).getByRole("link", { name: "Prontuário" }).click();

    await expect(page.getByRole("heading", { name: linkedPatientName })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Anamnese/ })).toBeVisible();
    // Pacotes: o Profissional vê o saldo, sem preço (AD-027, #296).
    await page.getByRole("tab", { name: "Pacotes" }).click();
    // Contra o `next dev` em máquina lenta a API de pacotes responde depois dos 10 s padrão (#308).
    await expect(page.getByText("Nenhum pacote de sessões para este paciente.")).toBeVisible({
      timeout: 30_000,
    });
    expect(failures.list()).toEqual([]);
  });

  test("profissional vê a própria consulta na agenda", async ({ page }) => {
    const { linkedPatientName } = loadSeedData();
    const failures = trackApiFailures(page);
    const slot = slotFromSeed("papeis-vinculo-profissional");

    await page.goto("/agenda");
    await goToMonth(page, slot.ymd);

    await expect(
      page.getByRole("button", { name: `${slot.startTimeInput} ${abbreviatePatientName(linkedPatientName)}`, exact: true }),
    ).toBeVisible();
    expect(failures.list()).toEqual([]);
  });

  test("profissional registra evolução no paciente vinculado", async ({ page }) => {
    const failures = trackApiFailures(page);
    const subjective = `Dor leve ao trocar a placa ${unique()}`;

    await openRecord(page, /Evoluções \(SOAP\)/);
    await page.getByRole("button", { name: "+ Nova evolução" }).click();
    await page.getByLabel(/S — Subjetivo/).fill(subjective);
    await page.getByLabel(/P — Plano/).fill("Manter troca a cada 3 dias");
    await page.getByRole("button", { name: "Registrar evolução" }).click();

    await expectToast(page, "Evolução registrada");
    const note = page.getByRole("listitem").filter({ hasText: subjective });
    // Autoria vem da sessão; o nome sai da lista reduzida /api/options/professionals.
    await expect(note).toContainText(SEED_PROFESSIONAL);
    expect(failures.list()).toEqual([]);
  });

  test("profissional vinculado percorre o ciclo da SAE", async ({ page }) => {
    const { linkedPatientId } = loadSeedData();
    const failures = trackApiFailures(page);
    const title = `Lesão sacral do profissional ${unique()}`;
    await createCondition(page.request, linkedPatientId, { kind: "wound", title });

    await openRecord(page, /Plano de Cuidados \(SAE\)/);
    await page.getByRole("button", { name: "+ Novo plano" }).click();
    await page.getByLabel("Condição associada").selectOption({ label: title });
    await page.getByRole("button", { name: "Abrir plano" }).click();
    const planCard = page.locator("li", { hasText: title });
    await expect(planCard).toBeVisible();
    await planCard.getByRole("button", { name: "Ver plano" }).click();

    // Diagnóstico NANDA-I pela busca — era aqui que o 403 da taxonomia travava.
    await page.getByRole("button", { name: "+ Diagnóstico" }).click();
    await page.getByLabel("Buscar diagnóstico (NANDA-I)").fill("pele");
    await page.getByText(/Integridade da pele prejudicada/).click();
    await page.getByLabel("Relacionado a (etiologia)").fill("Umidade excessiva por exsudato");
    await page.getByLabel("Evidenciado por (características definidoras)").fill("Ruptura da epiderme");
    await page.getByRole("button", { name: "Prescrever diagnóstico" }).click();
    await expect(page.getByText(/relacionado a Umidade excessiva por exsudato/)).toBeVisible();

    // Resultado NOC — sugestão ligada ao diagnóstico (linked-terms).
    await page.getByRole("button", { name: "+ Resultado" }).click();
    await page.getByText(/Integridade tissular: pele e mucosas/).click();
    await page.getByLabel("Pontuação basal (1–5)").fill("2");
    await page.getByLabel("Meta (1–5)").fill("4");
    await page.getByRole("button", { name: "Prescrever resultado" }).click();
    await expect(page.getByText("Basal 2")).toBeVisible();

    // Intervenção NIC, execução e avaliação.
    await page.getByRole("button", { name: "+ Intervenção" }).click();
    await page.getByText(/Cuidados com lesões/).click();
    await page.getByLabel("Frequência *").fill("A cada troca de placa");
    await page.getByRole("button", { name: "Prescrever intervenção" }).click();
    await expect(page.getByText(/A cada troca de placa/)).toBeVisible();
    await page.getByRole("button", { name: "Registrar execução" }).click();
    await expect(page.getByText(/Última execução:/)).toBeVisible();
    await page.getByRole("button", { name: "Avaliar" }).click();
    await page.getByText("4 — Levemente comprometido").click();
    await page.getByRole("button", { name: "Registrar avaliação" }).click();
    await expect(page.getByText("Meta atingida")).toBeVisible();

    expect(failures.list()).toEqual([]);
  });
});
