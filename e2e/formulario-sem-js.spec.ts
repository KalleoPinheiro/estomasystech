import { expect, test } from "@playwright/test";

// #777: sem JavaScript (ou antes da hidratação) o envio nativo não pode pôr o
// e-mail na URL. Mobile first: 360, 390, 768 e 1280.
test.use({
  javaScriptEnabled: false,
  storageState: { cookies: [], origins: [] },
});

const LARGURAS = [360, 390, 768, 1280];

for (const width of LARGURAS) {
  test(`Esqueci a senha sem JS não vaza o e-mail na URL (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/esqueci-senha");

    const form = page.locator("form");
    await expect(form).toHaveAttribute("method", "post");

    // Sem JS não há hidratação: o campo fica desabilitado e nada é enviado.
    await expect(page.locator("fieldset[disabled] input[type=email]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Enviar link" })).toBeDisabled();

    expect(page.url()).not.toContain("email=");
    expect(page.url()).not.toContain("@");
  });
}

test.describe("envio nativo forçado", () => {
  test.use({ javaScriptEnabled: true });

  test("Dado o envio nativo (como antes da hidratação), quando o formulário é enviado, então vai por POST e o e-mail não aparece na URL", async ({
    page,
  }) => {
    await page.goto("/esqueci-senha");
    await page.getByLabel("E-mail").fill("paciente@exemplo.com");

    const requisicao = page.waitForRequest(
      (req) => req.isNavigationRequest() && req.url().includes("/esqueci-senha"),
    );
    await page.locator("form").evaluate((f: HTMLFormElement) => f.submit());
    const enviada = await requisicao;

    expect(enviada.method()).toBe("POST");
    expect(enviada.url()).not.toContain("paciente");
    expect(enviada.url()).not.toContain("email=");
  });
});
