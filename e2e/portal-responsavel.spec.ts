import { expect, test } from "@playwright/test";
import {
  createGuardian,
  createPatient,
  linkGuardianAccount,
  linkPortalAccount,
  unique,
} from "./support/api";
import { ACTING_PATIENT_COOKIE } from "../src/lib/auth/acting-patient";
import { sessionCookie } from "./support/session-token";

test.describe("portal do responsável (ADR-027)", () => {
  test("responsável escolhe o paciente, vê o aviso 'em nome de' e não enxerga os atos do titular", async ({
    page,
    context,
    request,
  }) => {
    const id = unique();
    const guardian = await createGuardian(request, `Ana Responsável ${id}`, `resp.${id}@e2e.estomasystech.test`);
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
    const guardian = await createGuardian(request, `Bia Responsável ${id}`, `bia.${id}@e2e.estomasystech.test`);
    const patient = await createPatient(request, { fullName: `Tomás Titular ${id}`, guardianId: guardian.id });
    await linkGuardianAccount(request, guardian);
    await linkPortalAccount(request, "patient", patient);

    await context.addCookies([sessionCookie(patient.email, "patient")]);
    await page.goto("/portal");

    await expect(page.getByText(`${guardian.fullName} (Filho(a))`)).toBeVisible();
    await expect(page.getByText("pode acessar este portal em seu nome")).toBeVisible();
  });

  test("paciente encerra o acesso do responsável e o responsável deixa de entrar (ADR-028)", async ({ page, context, request }) => {
    const id = unique();
    const guardian = await createGuardian(request, `Carla Responsável ${id}`, `carla.${id}@e2e.estomasystech.test`);
    const patient = await createPatient(request, { fullName: `Davi Titular ${id}`, guardianId: guardian.id });
    await linkGuardianAccount(request, guardian);
    await linkPortalAccount(request, "patient", patient);

    await context.addCookies([sessionCookie(patient.email, "patient")]);
    await page.goto("/portal");
    await page.getByRole("button", { name: "Encerrar acesso" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Encerrar acesso" }).click();
    await expect(page.getByText("pode acessar este portal em seu nome")).toHaveCount(0);

    await context.clearCookies();
    await context.addCookies([sessionCookie(guardian.email, "guardian")]);
    await page.goto("/portal");
    await expect(page.getByText(`Acessando em nome de ${patient.fullName}.`)).toHaveCount(0);
  });

  test("a escolha pela Server Action grava o cookie e a tela já renderiza com ele (#553, PR 2b)", async ({
    page,
    context,
    request,
  }) => {
    const id = unique();
    const guardian = await createGuardian(request, `Eva Responsável ${id}`, `eva.${id}@e2e.estomasystech.test`);
    const child = await createPatient(request, { fullName: `Caio Filho ${id}`, guardianId: guardian.id });
    // Com um só representado o portal já o escolhe; com dois, aparece a lista.
    await createPatient(request, { fullName: `Duda Filha ${id}`, guardianId: guardian.id });
    await linkGuardianAccount(request, guardian);
    await context.addCookies([sessionCookie(guardian.email, "guardian")]);
    await page.goto("/portal");
    expect((await context.cookies()).some((c) => c.name === ACTING_PATIENT_COOKIE)).toBe(false);

    await page.getByRole("button", { name: child.fullName }).click();

    // O refresh() da própria ação já traz a tela do paciente escolhido, sem /api.
    await expect(page.getByText(`Acessando em nome de ${child.fullName}.`)).toBeVisible();
    const acting = (await context.cookies()).find((c) => c.name === ACTING_PATIENT_COOKIE);
    expect(acting?.value).toBe(child.id);
    expect(acting?.httpOnly).toBe(true);

    // A escolha sobrevive a uma nova carga e «Trocar paciente» apaga o cookie.
    await page.reload();
    await expect(page.getByText(`Acessando em nome de ${child.fullName}.`)).toBeVisible();
    await page.getByRole("button", { name: "Trocar paciente" }).click();
    await expect(page.getByRole("heading", { name: "Em nome de quem você acessa?" })).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === ACTING_PATIENT_COOKIE && c.value !== "")).toBe(false);
  });
});
