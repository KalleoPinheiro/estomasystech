import { test, expect } from "@playwright/test";
import {
  addAssessment,
  completeAppointment,
  createAppointment,
  createCondition,
  createPatient,
  unique,
} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";

test.describe("exportação de dados do titular (LGPD art. 18)", () => {
  test("exporta todos os dados do paciente em um único JSON", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Export LGPD ${unique()}` });
    const condition = await createCondition(request, patient.id, {
      kind: "wound",
      title: `Ferida export E2E ${unique()}`,
    });
    await addAssessment(request, condition.id, { lengthMm: 15, widthMm: 8, depthMm: 2 });

    const slot = slotForAttempt("export-lgpd-appointment-1");
    const appointment = await createAppointment(request, {
      patientId: patient.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure: `Procedimento export E2E ${unique()}`,
      priceCents: 8000,
    });
    await completeAppointment(request, appointment.id);

    const response = await page.request.get(`/api/patients/${patient.id}/export`);
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.success).toBe(true);

    const data = body.data;
    expect(data.patient.id).toBe(patient.id);
    expect(data.patient.fullName).toBe(patient.fullName);
    expect(typeof data.exportedAt).toBe("string");
    expect(new Date(data.exportedAt).toString()).not.toBe("Invalid Date");

    expect(data.conditions).toHaveLength(1);
    expect(data.conditions[0].id).toBe(condition.id);
    expect(data.assessments).toHaveLength(1);
    expect(data.assessments[0].lengthMm).toBe(15);

    expect(data.appointments).toHaveLength(1);
    expect(data.appointments[0].id).toBe(appointment.id);
    expect(data.appointments[0].status).toBe("completed");

    expect(data.invoices).toHaveLength(1);
    expect(data.invoices[0].amountCents).toBe(8000);

    expect(Array.isArray(data.consents)).toBe(true);
    expect(Array.isArray(data.packages)).toBe(true);
    expect(data.anamnesis).toBeNull();
  });

  // why: cenário "paciente inexistente retorna 404" removido (#113) — 100% API,
  // sem toque de UI, duplicava tests/api/audit-lgpd-routes.test.ts:223. Ver
  // .specs/features/e2e-cortar-redundantes/levantamento.md.

  test("exportação fica registrada na trilha de auditoria", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Export Auditado ${unique()}` });

    const response = await page.request.get(`/api/patients/${patient.id}/export`);
    expect(response.ok()).toBe(true);

    // recordAudit roda em after() — best-effort, pode não estar gravado no instante
    // exato da resposta; tenta de novo (recarregando) até aparecer.
    await expect(async () => {
      await page.goto("/auditoria");
      // Espera a lista já filtrada: sem isso a asserção vê a trilha inteira,
      // com leituras de outros specs.
      const filtered = page.waitForResponse((r) => r.url().includes(`patientId=${patient.id}`));
      await page.getByRole("combobox").selectOption({ label: patient.fullName });
      await filtered;
      await expect(page.getByRole("row", { name: /Leitura/ }).first()).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
  });
});
