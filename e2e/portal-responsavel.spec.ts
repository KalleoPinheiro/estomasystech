import { expect, test } from "@playwright/test";
import {
  createGuardian,
  createPatient,
  linkGuardianAccount,
  linkPortalAccount,
  unique,
} from "./support/api";
import { sessionCookie } from "./support/session-token";

test.describe("portal do responsável (ADR-027)", () => {
  test("responsável escolhe o paciente, vê o aviso 'em nome de' e não enxerga os atos do titular", async ({
    page,
    context,
    request,
  }) => {
    const id = unique();
    const guardian = await createGuardian(request, `Ana Responsável ${id}`, `resp.${id}@e2e.vittaflow.test`);
    const first = await createPatient(request, { fullName: `Luiza Filha ${id}`, guardianId: guardian.id });
    const second = await createPatient(request, { fullName: `Pedro Filho ${id}`, guardianId: guardian.id });
    await linkGuardianAccount(request, guardian);

    await context.addCookies([sessionCookie(guardian.email, "guardian")]);
    await page.goto("/portal");

    await expect(page.getByRole("heading", { name: "Em nome de quem você acessa?" })).toBeVisible();
    await page.getByRole("button", { name: first.fullName }).click();

    await expect(page.getByText(`Acessando em nome de ${first.fullName}.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: first.fullName })).toBeVisible();
    // Atos do titular não aparecem para o responsável.
    await expect(page.getByRole("button", { name: "Li e aceito o termo" })).toHaveCount(0);

    await page.getByRole("button", { name: "Trocar paciente" }).click();
    await page.getByRole("button", { name: second.fullName }).click();
    await expect(page.getByText(`Acessando em nome de ${second.fullName}.`)).toBeVisible();
  });

  test("paciente vê quem pode acessar o portal em nome dele", async ({ page, context, request }) => {
    const id = unique();
    const guardian = await createGuardian(request, `Bia Responsável ${id}`, `bia.${id}@e2e.vittaflow.test`);
    const patient = await createPatient(request, { fullName: `Tomás Titular ${id}`, guardianId: guardian.id });
    await linkGuardianAccount(request, guardian);
    await linkPortalAccount(request, "patient", patient);

    await context.addCookies([sessionCookie(patient.email, "patient")]);
    await page.goto("/portal");

    await expect(page.getByText(`${guardian.fullName} (Filho(a))`)).toBeVisible();
    await expect(page.getByText("pode acessar este portal em seu nome")).toBeVisible();
  });
});
