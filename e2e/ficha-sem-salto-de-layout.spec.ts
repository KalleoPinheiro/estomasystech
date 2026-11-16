import { expect, test } from "@playwright/test";
import { createPatient, unique } from "./support/api";

/**
 * #559: a ficha não pode saltar quando as fontes terminam de carregar. Com o selo «Ativo» livre para
 * trocar de linha, um nome no limite da largura (~22 letras em 390 px) fazia o selo ir para baixo do
 * título e voltar a cada fonte que chegava, e a tela inteira saltava 36 px duas vezes (CLS 0,49).
 * A garantia é de layout, não de tempo: o selo fica sempre ao lado do título, qualquer que seja o nome.
 * Mede também o CLS com CPU 4x e rede de celular, sem cache, como prova de que nada salta.
 */
const LIMITE_CLS = 0.1;
const NOMES = [
  "Ana Lima",
  "Paciente Vinculado E2E",
  "Maria Aparecida dos Santos",
  "Maria Aparecida dos Santos Oliveira Lima Pereira",
];

for (const largura of [360, 390]) {
  for (const nome of NOMES) {
    test(`ficha com o selo ao lado do título e sem salto em ${largura}px: nome de ${nome.length} letras`, async ({
      page,
      request,
    }) => {
      const paciente = await createPatient(request, { fullName: nome });
      await page.setViewportSize({ width: largura, height: 844 });
      await page.addInitScript(() => {
        const medida = { cls: 0 };
        (window as unknown as { __cls: typeof medida }).__cls = medida;
        new PerformanceObserver((lista) => {
          for (const e of lista.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
            if (!e.hadRecentInput) medida.cls += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      const rota = `/pacientes/${paciente.id}`;
      await page.goto(rota, { waitUntil: "load" });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: 200_000,
        uploadThroughput: 90_000,
      });
      await page.goto(rota, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);

      const titulo = await page.locator("[data-page-header] h1").boundingBox();
      const selo = await page.locator("[data-page-header]").getByText("Ativo", { exact: true }).boundingBox();
      expect(titulo).not.toBeNull();
      expect(selo).not.toBeNull();
      // O selo cabe na altura do título (mesma linha, ou ao lado de um título de duas linhas).
      expect(selo!.y).toBeGreaterThanOrEqual(titulo!.y - 1);
      expect(selo!.y + selo!.height).toBeLessThanOrEqual(titulo!.y + titulo!.height + 1);
      expect(selo!.x).toBeGreaterThanOrEqual(titulo!.x + titulo!.width - 1);

      const cls = await page.evaluate(() => (window as unknown as { __cls: { cls: number } }).__cls.cls);
      expect(cls).toBeLessThanOrEqual(LIMITE_CLS);
    });
  }
}
