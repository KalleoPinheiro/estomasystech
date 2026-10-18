import { test, expect, type Browser } from "@playwright/test";
import { addAssessment, createAppointment, createCondition, createPartner, createPatient, unique, linkPortalAccount} from "./support/api";
import { slotForAttempt } from "./support/dates";
import { toApiDatetime } from "./support/iso-datetime";
import { sessionCookie } from "./support/session-token";
import { literal } from "./support/regexp";

test.describe("portal do parceiro", () => {
  /** Contexto limpo (sem a sessão de equipe do storageState) com o cookie do portal. */
  async function portalPage(browser: Browser, email: string, role: "patient" | "partner") {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await context.addCookies([sessionCookie(email, role)]);
    return { context, page: await context.newPage() };
  }

  test("parceiro vê a evolução só com o consentimento do paciente, que a equipe pode revogar (#292)", async ({
    page,
    browser,
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
    await linkPortalAccount(request, "patient", referred);

    // 1. Sem consentimento: o parceiro vê só o status do encaminhamento.
    const partnerPortal = await portalPage(browser, partner.email, "partner");
    await partnerPortal.page.goto("/portal");
    await expect(partnerPortal.page.getByRole("heading", { name: partner.fullName })).toBeVisible();
    await expect(partnerPortal.page.getByText(referred.fullName)).toBeVisible();
    await expect(partnerPortal.page.getByText(notReferred.fullName)).not.toBeVisible();
    await expect(partnerPortal.page.getByText(/não autorizou o compartilhamento/)).toBeVisible();
    await expect(partnerPortal.page.getByText("Sem atendimento realizado")).toBeVisible();
    await expect(partnerPortal.page.getByRole("button", { name: literal(referred.fullName) })).toHaveCount(0);

    // 2. O paciente autoriza pelo portal.
    const patientPortal = await portalPage(browser, referred.email, "patient");
    await patientPortal.page.goto("/portal");
    await expect(
      patientPortal.page.getByRole("heading", { name: `Compartilhar com ${partner.fullName}` }),
    ).toBeVisible();
    await expect(patientPortal.page.getByText(/CONSENTIMENTO PARA COMPARTILHAR DADOS CLÍNICOS/)).toBeVisible();
    await patientPortal.page.getByRole("button", { name: "Li e autorizo" }).click();
    await expect(patientPortal.page.getByText(/Autorizado em/)).toBeVisible();

    // 3. Com consentimento: consultas e evolução clínica.
    await partnerPortal.page.reload();
    await partnerPortal.page.getByRole("button", { name: literal(referred.fullName) }).click();
    await expect(partnerPortal.page.getByText(procedure)).toBeVisible();
    await expect(partnerPortal.page.getByText(condition.title)).toBeVisible();

    // 4. A equipe revoga pela ficha (sessão de Admin do storageState).
    await page.goto(`/pacientes/${referred.id}`);
    const panel = page.locator("[data-partner-consent-panel]");
    // As rotas `partner-consent` e `.../revoke` só são chamadas aqui: no
    // servidor dev, a primeira chamada compila a rota, o que no runner do CI
    // passa dos 10s padrão (falhou assim no CI da #303).
    const firstCompile = { timeout: 30_000 };
    await expect(panel.getByText(/Autorizado pelo paciente em/)).toBeVisible(firstCompile);
    await panel.getByRole("button", { name: "Revogar a pedido do paciente" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revogar" }).click();
    await expect(panel.getByText(/Revogado pela equipe em/)).toBeVisible(firstCompile);

    // 5. Revogado: o parceiro volta a ver só o status.
    await partnerPortal.page.reload();
    await expect(partnerPortal.page.getByText(/não autorizou o compartilhamento/)).toBeVisible();
    await expect(partnerPortal.page.getByText(procedure)).not.toBeVisible();

    await partnerPortal.context.close();
    await patientPortal.context.close();
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
