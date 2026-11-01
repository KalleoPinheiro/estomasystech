import { expect, type Page, test } from "@playwright/test";
import { addAssessment, createCondition, createPatient, linkPortalAccount, unique } from "./support/api";
import { expectToast } from "./support/assertions";
import { sessionCookie } from "./support/session-token";

/**
 * Mobile no prontuário e no portal (#523, #525, #517): as três telas medidas em
 * 360 e 390px, os dois larguras de celular de referência. Cada teste mede caixas no
 * navegador — classe CSS não prova layout.
 */

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
const MIN_TOUCH_PX = 44;

async function seedPatient(request: Parameters<typeof createPatient>[0]) {
  const patient = await createPatient(request, { fullName: `Paciente Mobile ${unique()}` });
  const wound = await createCondition(request, patient.id, { kind: "wound", title: `Ferida mobile ${unique()}` });
  return { patient, wound };
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  const size = `${viewport.width}x${viewport.height}`;

  test.describe(`prontuário e portal no celular (${size})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
    });

    test(`avaliação de ferida: folha de tela cheia, rodapé fixo e barra inferior fora do caminho (${size})`, async ({
      page,
      request,
    }) => {
      const { patient, wound } = await seedPatient(request);
      await page.goto(`/pacientes/${patient.id}?aba=condicoes`);
      await expect(page.getByText(wound.title)).toBeVisible();
      await page.getByRole("button", { name: "+ Avaliação" }).click();

      const sheet = page.getByRole("dialog", { name: /Avaliação — / });
      await expect(sheet).toBeVisible();

      // Tela cheia: a folha cobre a altura da janela.
      // (poll: a folha sobe com animação, a caixa só assenta no fim)
      await expect
        .poll(async () => {
          const box = await sheet.boundingBox();
          return box ? Math.round(box.y) <= 1 && Math.round(box.height) >= viewport.height - 1 : false;
        })
        .toBe(true);

      // A barra de atalhos não pode ser tocada por cima da folha.
      const coveredByNav = await page.evaluate(() => {
        const nav = document.querySelector("[data-bottom-nav]");
        const rect = nav?.getBoundingClientRect();
        if (!nav || !rect) return null;
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return nav.contains(hit);
      });
      expect(coveredByNav).toBe(false);
      await expect(page.getByRole("navigation", { name: "Atalhos" })).toHaveCount(0);

      // O botão principal está à vista sem rolar, com alvo de toque de 44px.
      const submit = sheet.getByRole("button", { name: "Registrar avaliação" });
      await expect(submit).toBeInViewport();
      const submitBox = await submit.boundingBox();
      expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect((submitBox?.y ?? 0) + (submitBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);

      // E continua à vista depois de rolar o formulário até o fim.
      await sheet.getByLabel("Observações").scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
    });

    test(`avaliação de ferida: sair com dado preenchido pede confirmação e registrar fecha a folha (${size})`, async ({
      page,
      request,
    }) => {
      const { patient } = await seedPatient(request);
      await page.goto(`/pacientes/${patient.id}?aba=condicoes`);
      await page.getByRole("button", { name: "+ Avaliação" }).click();
      const sheet = page.getByRole("dialog", { name: /Avaliação — / });
      await sheet.getByLabel("Comprimento (mm)").fill("20");
      await sheet.getByLabel("Largura (mm)").fill("10");

      await sheet.getByRole("button", { name: "Cancelar" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm.getByText("Descartar avaliação?")).toBeVisible();

      await confirm.getByRole("button", { name: "Continuar editando" }).click();
      await expect(sheet.getByLabel("Comprimento (mm)")).toHaveValue("20");

      await sheet.getByRole("button", { name: "Registrar avaliação" }).click();
      await expectToast(page, "Avaliação registrada");
      await expect(sheet).toBeHidden();
      // Fechada a folha, a barra de atalhos volta a ser tocável.
      await expect(page.getByRole("navigation", { name: "Atalhos" })).toBeVisible();
    });

    test(`avaliação de ferida: sem dado preenchido fecha direto e Descartar fecha com dado (${size})`, async ({
      page,
      request,
    }) => {
      const { patient } = await seedPatient(request);
      await page.goto(`/pacientes/${patient.id}?aba=condicoes`);

      await page.getByRole("button", { name: "+ Avaliação" }).click();
      const sheet = page.getByRole("dialog", { name: /Avaliação — / });
      await sheet.getByRole("button", { name: "Cancelar" }).click();
      await expect(sheet).toBeHidden();

      await page.getByRole("button", { name: "+ Avaliação" }).click();
      await sheet.getByLabel("Dor (0–10)").fill("4");
      await sheet.getByRole("button", { name: "Cancelar" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Descartar" }).click();
      await expect(sheet).toBeHidden();
    });

    test(`ficha do paciente: abas rolam com indício, a ativa fica à vista e as ações vão para "Mais ações" (${size})`, async ({
      page,
      request,
    }) => {
      const { patient } = await seedPatient(request);
      await page.goto(`/pacientes/${patient.id}?aba=pacotes`);
      const tabs = page.getByRole("tablist", { name: "Seções do prontuário" });
      await expect(tabs).toBeVisible();
      await noHorizontalOverflow(page);

      // A última aba (Pacotes) está ativa e rolada para a vista; ainda há aba escondida à esquerda.
      const pacotes = tabs.getByRole("tab", { name: /Pacotes/ });
      await expect(pacotes).toBeInViewport({ ratio: 0.99 });
      const hint = await tabs.evaluate((el) => ({
        scrolls: el.scrollWidth > el.clientWidth,
        mask: getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage,
        snap: getComputedStyle(el).scrollSnapType,
      }));
      expect(hint.scrolls).toBe(true);
      expect(hint.mask).toContain("linear-gradient");
      expect(hint.snap).toContain("x");

      // Cabeçalho: voltar com alvo de 44px; as duas ações num menu.
      const back = page.getByRole("link", { name: /Pacientes/ }).first();
      expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      await expect(page.getByRole("link", { name: "Termo de consentimento" })).toHaveCount(0);
      const more = page.getByRole("button", { name: "Mais ações" });
      expect((await more.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      await more.click();
      for (const name of ["Termo de consentimento", "Exportar dados (LGPD)"]) {
        const item = page.getByRole("menuitem", { name });
        await expect(item).toBeVisible();
        expect((await item.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      }
    });

    test(`portal: gráfico de evolução legível e lista textual das medições (${size})`, async ({
      page,
      context,
      request,
    }) => {
      const { patient, wound } = await seedPatient(request);
      await addAssessment(request, wound.id, { lengthMm: 20, widthMm: 10, depthMm: 2, painScale: 5 });
      await addAssessment(request, wound.id, { lengthMm: 16, widthMm: 8, depthMm: 1, painScale: 3 });
      await linkPortalAccount(request, "patient", patient);
      await context.addCookies([sessionCookie(patient.email, "patient")]);

      await page.goto("/portal");
      const chart = page.getByRole("img", { name: "Gráfico de evolução da condição" });
      await expect(chart).toBeVisible();
      await noHorizontalOverflow(page);

      // Texto do gráfico: tamanho real na tela (fonte × escala do SVG) de pelo menos 12px.
      const smallest = await chart.evaluate((svg) => {
        const box = svg.getBoundingClientRect();
        const viewBox = (svg as SVGSVGElement).viewBox.baseVal;
        const scale = box.width / viewBox.width;
        const sizes = [...svg.querySelectorAll("text")].map((t) => Number.parseFloat(t.getAttribute("font-size") ?? "0") * scale);
        return { min: Math.min(...sizes), height: box.height };
      });
      expect(smallest.min).toBeGreaterThanOrEqual(11.5);
      expect(smallest.height).toBeGreaterThanOrEqual(180);

      // Legenda com uma chave por série e lista textual das duas medições, com a tendência.
      // Dentro do <main>: a cópia que o React deixa num <div hidden> durante o streaming não conta.
      await expect(page.getByRole("main").getByText("Área da ferida (mm²)")).toBeVisible();
      await expect(page.getByText("Gravidade clínica")).toHaveCount(0);
      await expect(page.getByRole("main").getByText("Dor (0–10)")).toBeVisible();
      const medicoes = page.getByRole("list", { name: "Medições registradas" });
      await expect(medicoes.getByRole("listitem")).toHaveCount(2);
      await expect(medicoes).toContainText("desde a anterior");
    });
  });
}
