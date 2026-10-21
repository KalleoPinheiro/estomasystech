import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Trava de acessibilidade (#424, WCAG 2.2 AA): nenhuma violação séria ou crítica
 * nas telas públicas. Entra no `gate:local`; as telas novas da identidade visual
 * (Hoje, Identidade, Aparência) somam suas rotas aqui quando chegarem.
 */

// Estas telas são públicas: começam sempre deslogadas.
test.use({ storageState: { cookies: [], origins: [] } });

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TELAS_PUBLICAS = [
  { nome: "login", rota: "/login" },
  { nome: "esqueci minha senha", rota: "/esqueci-senha" },
];

test.describe("acessibilidade das telas públicas", () => {
  for (const tela of TELAS_PUBLICAS) {
    for (const esquema of ["light", "dark"] as const) {
      test(`${tela.nome} (${esquema}) não tem violação séria ou crítica`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: esquema });
        await page.goto(tela.rota);
        await expect(page.locator("main, form").first()).toBeVisible();

        const resultado = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        const graves = resultado.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );

        expect(
          graves.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} elemento(s), ex.: ${v.nodes[0]?.target.join(" ")}`),
          `Violações em ${tela.rota}`,
        ).toEqual([]);
      });
    }
  }
});
