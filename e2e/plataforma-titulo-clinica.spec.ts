import { expect, test } from "@playwright/test";
import { apiPost } from "./support/api";
import { validCnpj } from "./support/cnpj";
import { SUPER_ADMIN_STORAGE_STATE_PATH } from "./support/constants";

/**
 * #884: no detalhe de clínica da Plataforma, em 360 e 390 px, o selo «Cadastro completo» ao lado do
 * título o espremia e a palavra partia no meio («Homolog/ação»). O selo desce para a linha de baixo
 * por largura de tela (CSS), e o título só quebra entre palavras. Os selos não podem ser cortados.
 */
test.describe("detalhe de clínica na plataforma: título sem palavra partida", () => {
  test.use({ storageState: SUPER_ADMIN_STORAGE_STATE_PATH });

  for (const largura of [360, 390]) {
    test(`título inteiro e selos sem corte em ${largura}px`, async ({ page }) => {
      const digits = String(Date.now()).slice(-12).padStart(12, "0");
      const nome = "Clínica Homologação (fictícia)";
      const created = await apiPost<{ clinic: { id: string } }>(page.request, "/api/platform/clinics", {
        name: nome,
        cnpj: validCnpj(`${digits.slice(0, 11)}3`),
        contactPhone: "11 3333-4444",
        contactEmail: "contato@titulo-e2e.test",
        adminEmail: `admin-${digits}@titulo-e2e.test`,
      });
      await page.setViewportSize({ width: largura, height: 844 });
      await page.goto(`/plataforma/clinicas/${created.clinic.id}`);
      const titulo = page.getByRole("heading", { level: 1, name: nome });
      await expect(titulo).toBeVisible();
      const selo = page.locator("[data-page-header]").getByText("Cadastro completo", { exact: true });
      await expect(selo).toBeVisible();

      // Nenhuma palavra do título é partida entre linhas.
      const palavrasPartidas = await titulo.evaluate((h1) => {
        const texto = h1.firstChild as Text;
        const partidas: string[] = [];
        for (const m of (texto.textContent ?? "").matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(texto, m.index ?? 0);
          r.setEnd(texto, (m.index ?? 0) + m[0].length);
          const topos = new Set([...r.getClientRects()].map((c) => Math.round(c.top)));
          if (topos.size > 1) partidas.push(m[0]);
        }
        return partidas;
      });
      expect(palavrasPartidas).toEqual([]);

      // O selo desce para a linha de baixo do título e cabe na tela.
      const caixaTitulo = await titulo.boundingBox();
      const caixaSelo = await selo.boundingBox();
      expect(caixaTitulo).not.toBeNull();
      expect(caixaSelo).not.toBeNull();
      expect(caixaSelo!.y).toBeGreaterThanOrEqual(caixaTitulo!.y + caixaTitulo!.height - 1);
      expect(caixaSelo!.x).toBeGreaterThanOrEqual(0);
      expect(caixaSelo!.x + caixaSelo!.width).toBeLessThanOrEqual(largura);

      // «Aguardando primeiro acesso» (admin convidado) aparece inteiro, sem corte.
      const aguardando = page.getByText("Aguardando primeiro acesso");
      await expect(aguardando).toBeVisible();
      const caixaAguardando = await aguardando.boundingBox();
      expect(caixaAguardando!.x).toBeGreaterThanOrEqual(0);
      expect(caixaAguardando!.x + caixaAguardando!.width).toBeLessThanOrEqual(largura);
      const cortado = await aguardando.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(cortado).toBe(false);

      // Sem rolagem horizontal da página.
      const transborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(transborda).toBe(false);
    });
  }
});
