/**
 * Handoff por issue (ADR-102): cada PR cria `.specs/archive/handoff/<issue>-<slug>.md`, arquivo novo que não
 * conflita no merge (mesmo padrão do `.changeset/*.md`). `.specs/archive/handoff-2026.md` está congelado como histórico.
 */

export const DIR_HANDOFF = '.specs/archive/handoff';
export const HANDOFF_CONGELADO = '.specs/archive/handoff-2026.md';

const EXIGE_HANDOFF = [/^src\//, /^drizzle\//, /^Dockerfile$/, /^\.github\/workflows\//, /^scripts\/release\//];
const ARQUIVO_HANDOFF = /^\.specs\/archive\/handoff\/(\d+)-[a-z0-9][a-z0-9.-]*\.md$/;

/** PR que muda código que roda em produção, pipeline ou release precisa do handoff novo. */
export const requiresHandoff = (changed: readonly string[]): boolean =>
  changed.some((f) => EXIGE_HANDOFF.some((re) => re.test(f)));

/** Há um arquivo de handoff recém-adicionado, com o nome `<issue>-<slug>.md`. */
export const hasHandoffFile = (added: readonly string[]): boolean => added.some((f) => ARQUIVO_HANDOFF.test(f));

/** O arquivo congelado foi editado: aviso (não falha) enquanto há PRs em voo que ainda escrevem nele. */
export const touchedFrozen = (changed: readonly string[]): boolean => changed.includes(HANDOFF_CONGELADO);

export type ArquivoHandoff = { caminho: string; conteudo: string };

/** Número da issue do nome `<issue>-<slug>.md`; `null` se o nome não segue o padrão. */
export const issueDoArquivo = (caminho: string): number | null => {
  const m = ARQUIVO_HANDOFF.exec(caminho);
  return m ? Number(m[1]) : null;
};

/**
 * Junta o histórico congelado e os arquivos por issue, em ordem crescente do número da issue (empate: pelo caminho).
 * Arquivo fora do padrão é ignorado. A saída é gerada, nunca editada à mão.
 */
export function agregarHandoffs(congelado: string, arquivos: readonly ArquivoHandoff[]): string {
  const validos = arquivos
    .map((a) => ({ ...a, issue: issueDoArquivo(a.caminho) }))
    .filter((a): a is ArquivoHandoff & { issue: number } => a.issue !== null)
    .sort((a, b) => a.issue - b.issue || a.caminho.localeCompare(b.caminho));
  const partes = validos.map((a) => a.conteudo.trim());
  return `${[congelado.trim(), ...partes].filter(Boolean).join('\n\n')}\n`;
}
