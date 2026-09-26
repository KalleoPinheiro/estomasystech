import { test, expect } from "@playwright/test";
import { apiGet, createPatient, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { goToMonth } from "./support/calendar";
import { businessDay, slotForAttempt, ymdToDateInput } from "./support/dates";
import { roleStorageState, trackApiFailures } from "./support/roles";
import { pickPatient } from "./support/patient-picker";
import { loadSeedData } from "./support/seed-data";

/**
 * Fluxos da recepção com a sessão real do Atendente (#188, #204): agenda e
 * lista de espera usam profissionais e catálogo pela lista reduzida
 * `/api/options/*` — antes, 403 escondia os campos e toda consulta nascia sem
 * profissional.
 */
test.use({ storageState: roleStorageState("atendente") });

const SEED_PROFESSIONAL = "Enf. Semente E2E";
const CATALOG_PROCEDURE = "Curativo especializado (seed E2E)";

interface AppointmentDto {
  id: string;
  patientId: string;
  professionalId: string | null;
  priceCents: number;
  procedure: string;
  startsAt: string;
  endsAt: string;
}

test.describe("atendente", () => {
  test("atendente agenda consulta atribuída a um profissional usando o catálogo", async ({ page }) => {
    const seed = loadSeedData();
    const failures = trackApiFailures(page);
    // A própria recepção cadastra o paciente (família operacional).
    const patient = await createPatient(page.request, { fullName: `Paciente Recepção ${unique()}` });
    const slot = slotForAttempt("papeis-atendente-agenda", 30);

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Nova consulta" }).click();
    // O nome acessível do <select> inclui a opção escolhida ("Profissional— sem atribuição").
    const form = page.getByRole("dialog", { name: "Nova consulta" });
    await pickPatient(form, patient.fullName);
    await form.getByLabel(/^Profissional/).selectOption({ label: SEED_PROFESSIONAL });
    await form.getByLabel(/^Procedimento do catálogo/).selectOption({ label: `${CATALOG_PROCEDURE} (30 min)` });
    await expect(form.getByLabel("Procedimento *")).toHaveValue(CATALOG_PROCEDURE);
    await expect(form.getByLabel("Valor (R$) *")).toHaveValue("120");
    await form.getByLabel("Data *").fill(slot.dateInput);
    await form.getByLabel("Início *").fill(slot.startTimeInput);
    await form.getByRole("button", { name: "Agendar consulta" }).click();

    await expectToast(page, "Consulta criada");
    await goToMonth(page, slot.ymd);
    await expect(
      page.getByRole("button", { name: `${slot.startTimeInput} ${patient.fullName}`, exact: true }),
    ).toBeVisible();

    const from = new Date(new Date(slot.startsAt).getTime() - 60_000).toISOString();
    const to = new Date(new Date(slot.endsAt).getTime() + 60_000).toISOString();
    const appointments = await apiGet<AppointmentDto[]>(page.request, `/api/appointments?from=${from}&to=${to}`);
    const created = appointments.find((a) => a.patientId === patient.id);
    expect(created).toMatchObject({
      professionalId: seed.professionalId,
      procedure: CATALOG_PROCEDURE,
      priceCents: 12000,
    });
    expect(
      new Date(created?.endsAt ?? 0).getTime() - new Date(created?.startsAt ?? 0).getTime(),
    ).toBe(30 * 60_000);
    expect(failures.list()).toEqual([]);
  });

  test("atendente adiciona à lista de espera com procedimento do catálogo", async ({ page }) => {
    const failures = trackApiFailures(page);
    const patient = await createPatient(page.request, { fullName: `Paciente Espera ${unique()}` });
    const from = ymdToDateInput(businessDay(10));
    const to = ymdToDateInput(businessDay(30));

    await page.goto("/agenda");
    await page.getByRole("button", { name: "+ Adicionar" }).click();
    const dialog = page.getByRole("dialog", { name: "Adicionar à lista de espera" });
    await pickPatient(dialog, patient.fullName);
    await dialog.getByLabel(/^Procedimento/).selectOption({ label: CATALOG_PROCEDURE });
    await dialog.getByLabel(/^Profissional/).selectOption({ label: SEED_PROFESSIONAL });
    await dialog.getByLabel("Aceita a partir de *").fill(from);
    await dialog.getByLabel("Até *").fill(to);
    await dialog.getByRole("button", { name: "Adicionar à lista" }).click();

    await expectToast(page, "Adicionado à lista de espera");
    const row = page.getByRole("listitem").filter({ hasText: patient.fullName });
    await expect(row).toContainText(CATALOG_PROCEDURE);
    await expect(row).toContainText(SEED_PROFESSIONAL);
    expect(failures.list()).toEqual([]);
  });
});
