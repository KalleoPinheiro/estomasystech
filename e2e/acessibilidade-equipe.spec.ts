import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Trava de acessibilidade das telas da equipe (#429, WCAG 2.2 AA): nenhuma
 * violação séria ou crítica, em tema claro e escuro, no celular (390px) onde o
 * shell novo aparece. Cada tela do #429 entra aqui no próprio PR. Sessão padrão
 * do E2E: Admin da clínica.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TELAS = [
  { nome: "Pacientes", rota: "/pacientes" },
  { nome: "Agenda", rota: "/agenda" },
  { nome: "Faturamento", rota: "/faturamento" },
  { nome: "Procedimentos", rota: "/procedimentos" },
  { nome: "Materiais", rota: "/materiais" },
  { nome: "Profissionais", rota: "/profissionais" },
  { nome: "Parceiros", rota: "/parceiros" },
  { nome: "Minha conta", rota: "/minha-conta" },
  { nome: "Configurações", rota: "/configuracoes" },
  { nome: "Relatórios", rota: "/relatorios" },
  { nome: "Repasses", rota: "/repasses" },
  { nome: "Auditoria", rota: "/auditoria" },
  { nome: "Triagem", rota: "/triagem" },
  { nome: "Pedidos do titular", rota: "/pedidos-titular" },
  { nome: "Hoje", rota: "/" },
  { nome: "Mais", rota: "/mais" },
];

test.use({ viewport: { width: 390, height: 844 } });

test.describe("acessibilidade das telas da equipe", () => {
  for (const tela of TELAS) {
    for (const esquema of ["light", "dark"] as const) {
      test(`${tela.nome} (${esquema}) não tem violação séria ou crítica`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: esquema });
        await page.addInitScript((mode) => {
          localStorage.setItem("estomasystech:modo", JSON.stringify({ mode, accent: "violet" }));
        }, esquema);
        await page.goto(tela.rota);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");

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
