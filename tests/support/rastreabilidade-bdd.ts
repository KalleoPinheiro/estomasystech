import type { CenarioVinculado } from '../bdd/regras-criticas';

/** Ids `XXX-RN-NN` das tabelas de regras de negócio de `docs/domains/<d>/README.md`. */
export function idsDeRegras(markdownDosDominios: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const markdown of markdownDosDominios) {
    for (const linha of markdown.split('\n')) {
      const achado = /^\|\s*([A-Z]{2,4}-RN-\d+)\s*\|/.exec(linha);
      if (achado?.[1]) {
        ids.add(achado[1]);
      }
    }
  }
  return [...ids];
}

const FORMATO_BDD = /^(Dad[oa]|Cenário:|Feature:)/;

/**
 * Problemas de rastreabilidade entre regras críticas, documentação e testes.
 * Lista vazia = toda regra crítica existe na doc e tem cenário Dado/Quando/Então
 * cujo título está literalmente no arquivo de teste citado.
 */
export function problemasDeRastreabilidade(
  criticas: Record<string, readonly CenarioVinculado[]>,
  idsDocumentados: readonly string[],
  lerArquivo: (caminho: string) => string | null,
): string[] {
  const problemas: string[] = [];
  for (const [id, cenarios] of Object.entries(criticas)) {
    if (!idsDocumentados.includes(id)) {
      problemas.push(`${id}: regra não existe nas tabelas de docs/domains`);
    }
    if (cenarios.length === 0) {
      problemas.push(`${id}: regra crítica sem cenário ligado`);
    }
    for (const { arquivo, titulo } of cenarios) {
      if (!FORMATO_BDD.test(titulo)) {
        problemas.push(
          `${id}: "${titulo}" não está no formato Dado/Quando/Então`,
        );
      }
      const conteudo = lerArquivo(arquivo);
      if (conteudo === null) {
        problemas.push(`${id}: arquivo ${arquivo} não existe`);
      } else if (!conteudo.includes(titulo)) {
        problemas.push(`${id}: cenário "${titulo}" não está em ${arquivo}`);
      }
    }
  }
  return problemas;
}
