import { expect, test } from "@playwright/test";
import { createInvoice, createPatient, unique } from "./support/api";
import { shown } from "./support/patient-name";
import { literal } from "./support/regexp";

/**
 * Homônimos nas listas (#429): dois pacientes com o mesmo nome abreviado mostram
 * a data de nascimento ao lado, nos dois; quem não colide mostra só o nome.
 */
test.describe("homônimos nas listas (#429)", () => {
  test("Dado dois pacientes que abreviam igual, Quando abrir Faturamento, Então os dois mostram o nascimento", async ({
    page,
    request,
  }) => {
    const tag = unique();
    const first = await createPatient(request, {
      fullName: `Homonimo Souza ${tag} Lima`,
      birthDate: "1980-03-12T12:00:00.000Z",
    });
    const second = await createPatient(request, {
      fullName: `Homonimo Santos ${tag} Lima`,
      birthDate: "1992-07-01T12:00:00.000Z",
    });
    const alone = await createPatient(request, { fullName: `Unico Paciente ${tag}` });
    for (const patient of [first, second, alone]) {
      await createInvoice(request, {
        patientId: patient.id,
        description: `Homonimos ${tag}`,
        amountCents: 10000,
      });
    }

    await page.goto("/faturamento");
    await page.getByRole("button", { name: "Pendentes" }).click();

    await expect(
      page.getByRole("row", { name: literal(`${shown(first.fullName)} · nasc. 12/03/1980`) }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: literal(`${shown(second.fullName)} · nasc. 01/07/1992`) }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: literal(shown(alone.fullName)) }),
    ).not.toContainText("nasc.");
  });
});
