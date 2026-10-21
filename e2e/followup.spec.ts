import { test, expect } from "@playwright/test";
import { createFollowUp, createPatient, unique } from "./support/api";
import { rx } from "./support/regexp";

const inDays = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

test.describe("retornos (follow-ups)", () => {
  test("retorno pendente aparece no dashboard e pode ser concluído", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Retorno ${unique()}` });
    const reason = `Retorno de curativo E2E ${unique()}`;
    await createFollowUp(request, { patientId: patient.id, dueDate: inDays(10), reason });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
    const item = page.locator("li", { hasText: reason });
    await expect(item).toBeVisible();
    await expect(item.getByText(patient.fullName)).toBeVisible();

    await item.getByRole("button", { name: "Concluir" }).click();
    await expect(page.locator("li", { hasText: reason })).toHaveCount(0);
  });

  test("retorno atrasado mostra alerta e pode ser cancelado", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Atrasado ${unique()}` });
    const reason = `Retorno atrasado E2E ${unique()}`;
    await createFollowUp(request, { patientId: patient.id, dueDate: inDays(-3), reason });

    await page.goto("/");
    const item = page.locator("li", { hasText: reason });
    await expect(item.getByText(/Atrasado —/)).toBeVisible();

    await item.getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar retorno" }).click();
    await expect(page.locator("li", { hasText: reason })).toHaveCount(0);
  });

  test("link Agendar leva para a agenda com os parâmetros do retorno", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Agendar Retorno ${unique()}` });
    const reason = `Retorno para agendar E2E ${unique()}`;
    const followUp = await createFollowUp(request, {
      patientId: patient.id,
      dueDate: inDays(5),
      reason,
    });

    await page.goto("/");
    const item = page.locator("li", { hasText: reason });
    const link = item.getByRole("link", { name: "Agendar", exact: true });
    await expect(link).toHaveAttribute(
      "href",
      rx`followUpId=${followUp.id}.*patientId=${patient.id}`,
    );

    // Limpeza: resolve o retorno para não poluir o dashboard de outros specs.
    await request.patch(`/api/follow-ups/${followUp.id}`, { data: { status: "cancelled" } });
  });

  test("não permite mudar o status de um retorno já concluído", async ({ request }) => {
    const patient = await createPatient(request);
    const followUp = await createFollowUp(request, {
      patientId: patient.id,
      dueDate: inDays(2),
      reason: `Retorno para conflito E2E ${unique()}`,
    });

    const first = await request.patch(`/api/follow-ups/${followUp.id}`, {
      data: { status: "done" },
    });
    expect(first.ok()).toBe(true);

    const second = await request.patch(`/api/follow-ups/${followUp.id}`, {
      data: { status: "cancelled" },
    });
    expect(second.ok()).toBe(false);
    const body = await second.json();
    expect(body.error).toContain("não pode mudar");
  });
});
