import { expect, test } from "@playwright/test";

const EMAIL = "paciente@exemplo.com";

// #777: o envio nativo (o mesmo de antes da hidratação, forçado aqui) leva o
// e-mail no corpo. A URL e o registro da requisição — o que um proxy grava —
// ficam sem o endereço.
test("Dado o envio nativo de esqueci a senha, quando a requisição sai, então o e-mail vai no corpo e não na URL nem no log", async ({
  page,
}) => {
  const registro: string[] = [];
  page.on("request", (req) => {
    registro.push(`${req.method()} ${req.url()}`);
  });
  page.on("console", (msg) => {
    registro.push(msg.text());
  });

  await page.goto("/esqueci-senha");
  await page.getByLabel("E-mail").fill(EMAIL);

  const requisicao = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().includes("/esqueci-senha"),
  );
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.submit();
  });
  const enviada = await requisicao;

  const corpo = decodeURIComponent(enviada.postData() ?? "").replaceAll("+", " ");
  expect(corpo).toContain(EMAIL);
  expect(enviada.url()).not.toContain("paciente");
  expect(enviada.url()).not.toContain("email=");

  const log = registro.join("\n");
  expect(log).not.toContain(EMAIL);
  expect(log).not.toContain("email=");
  expect(log).not.toContain("paciente%40");
});
