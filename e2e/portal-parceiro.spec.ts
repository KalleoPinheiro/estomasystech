import { test, expect } from "@playwright/test";
import { addAssessment, createAppointment, createCondition, createPartner, createPatient, unique, linkPortalAccount} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";
import { sessionCookie } from "./support/session-token";
import { literal } from "./support/regexp";

test.describe("portal do parceiro", () => {
  test("parceiro vê apenas os pacientes que indicou, com consultas e evolução clínica", async ({
    page,
    context,
    request,
  }) => {
    const partner = await createPartner(request, { fullName: `Dr. Portal E2E ${unique()}` });
    const otherPartner = await createPartner(request, { fullName: `Dr. Outro Portal E2E ${unique()}` });

    const referred = await createPatient(request, {
      fullName: `Paciente Indicado E2E ${unique()}`,
      referredByPartnerId: partner.id,
    });
    const notReferred = await createPatient(request, {
      fullName: `Paciente Não Indicado E2E ${unique()}`,
      referredByPartnerId: otherPartner.id,
    });

    const slot = slotForAttempt("portal-parceiro-appointment");
    const procedure = `Avaliação vascular E2E ${unique()}`;
    await createAppointment(request, {
      patientId: referred.id,
      startsAt: toApiDatetime(slot.startsAt),
      endsAt: toApiDatetime(slot.endsAt),
      procedure,
      priceCents: 18000,
    });
    const condition = await createCondition(request, referred.id, {
      kind: "wound",
      title: `Ferida indicada E2E ${unique()}`,
    });
    await addAssessment(request, condition.id, { lengthMm: 20, widthMm: 10, depthMm: 2 });

    await linkPortalAccount(request, "partner", partner);

    await context.addCookies([sessionCookie(partner.email, "partner")]);
    await page.goto("/portal");

    await expect(page.getByRole("heading", { name: partner.fullName })).toBeVisible();
    await expect(page.getByText(referred.fullName)).toBeVisible();
    await expect(page.getByText(notReferred.fullName)).not.toBeVisible();

    await page.getByRole("button", { name: literal(referred.fullName) }).click();

    await expect(page.getByText(procedure)).toBeVisible();
    await expect(page.getByText(condition.title)).toBeVisible();
  });

  test("parceiro sem pacientes indicados vê estado vazio", async ({ page, context, request }) => {
    const partner = await createPartner(request, { fullName: `Dr. Sem Indicação E2E ${unique()}` });

    await linkPortalAccount(request, "partner", partner);

    await context.addCookies([sessionCookie(partner.email, "partner")]);
    await page.goto("/portal");

    await expect(page.getByRole("heading", { name: partner.fullName })).toBeVisible();
    await expect(
      page.getByText("Nenhum paciente indicado por você até o momento."),
    ).toBeVisible();
  });
});
