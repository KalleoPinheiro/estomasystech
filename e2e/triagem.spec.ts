import { test, expect } from "@playwright/test";
import { createCondition, createPatient, unique, linkPortalAccount} from "./support/api";
import { sessionCookie } from "./support/session-token";
import { rx } from "./support/regexp";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const ADMIN_COOKIE = sessionCookie("local", "super_admin");

async function uploadPatientPhoto(
  page: import("@playwright/test").Page,
  patientEmail: string,
  conditionId: string,
  note: string,
): Promise<void> {
  await page.context().addCookies([sessionCookie(patientEmail, "patient")]);
  // Tratamento de imagem clínica exige base legal registrada (COMP3-01): sem
  // aceite vigente do termo, a rota de envio rejeita — o paciente do portal faz
  // esse aceite na tela, aqui vai pela mesma API.
  const consent = await page.request.post("/api/portal/patient/consent");
  expect(consent.ok(), `aceite do termo falhou: ${consent.status()}`).toBe(true);
  const response = await page.request.post("/api/portal/patient/photos", {
    multipart: {
      file: { name: "foto.png", mimeType: "image/png", buffer: TINY_PNG },
      conditionId,
      note,
    },
  });
  expect(response.ok()).toBe(true);
  // Volta para a sessão de equipe — o resto do teste opera no dashboard staff.
  await page.context().addCookies([ADMIN_COOKIE]);
}

test.describe("triagem de fotos", () => {
  test("mantém o plano: foto sai da fila sem gerar retorno", async ({ page, request }) => {
    const patient = await createPatient(request, { fullName: `Paciente Triagem OK ${unique()}` });
    await linkPortalAccount(request, "patient", patient);
    const condition = await createCondition(request, patient.id, {
      kind: "wound",
      title: `Ferida triagem OK ${unique()}`,
    });

    await uploadPatientPhoto(page, patient.email, condition.id, "leve vermelhidão");

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Fotos de pacientes aguardando triagem/ }),
    ).toBeVisible();
    const queueItem = page.locator("li", { hasText: patient.fullName });
    await expect(queueItem).toBeVisible();
    await expect(queueItem.getByText(condition.title)).toBeVisible();

    await queueItem.getByRole("button", { name: "Ok, manter plano" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.locator("li", { hasText: patient.fullName })).toHaveCount(0);

    // Manter o plano não deve criar um retorno antecipado para essa condição.
    await expect(
      page.getByText(rx`Retorno antecipado: foto de ${condition.title}`),
    ).toHaveCount(0);
  });

  test("antecipa retorno: foto sai da fila e cria um retorno pendente", async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { fullName: `Paciente Triagem Escalada ${unique()}` });
    await linkPortalAccount(request, "patient", patient);
    const condition = await createCondition(request, patient.id, {
      kind: "wound",
      title: `Ferida triagem escalada ${unique()}`,
    });

    await uploadPatientPhoto(page, patient.email, condition.id, "dor forte e secreção");

    await page.goto("/");
    const queueItem = page.locator("li", { hasText: patient.fullName });
    await expect(queueItem).toBeVisible();

    await queueItem.getByRole("button", { name: "Antecipar retorno" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirmar antecipação" })
      .click();
    // Checa só o item desta foto — a fila é global e compartilhada com outros
    // specs (ex.: fotos enviadas em clinico.spec.ts/portal-paciente.spec.ts
    // ficam pendentes de triagem), então o card pode continuar visível com
    // outros itens mesmo depois de resolver este.
    await expect(page.locator("li", { hasText: patient.fullName })).toHaveCount(0);

    // A lista de "Retornos pendentes" não recarrega sozinha quando a triagem
    // cria um retorno — só busca de novo com uma navegação/refresh da página.
    await page.reload();

    const followUpReason = `Retorno antecipado: foto de ${condition.title} sinaliza atenção`;
    const followUpItem = page.locator("li", { hasText: followUpReason });
    await expect(followUpItem).toBeVisible();

    // Limpeza: resolve o retorno criado para não poluir o dashboard de outros specs.
    await followUpItem.getByRole("button", { name: "Concluir" }).click();
    await expect(page.locator("li", { hasText: followUpReason })).toHaveCount(0);
  });
});
