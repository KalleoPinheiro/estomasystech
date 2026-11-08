/**
 * Regras puras do `conferir-release` (ADR-100): na PR release→main o the-judge NÃO é chamado de novo. O check
 * confere que cada PR incluída na release tem o check `Veredito do the-judge` aprovado, gravado pelo Actions no
 * head dela. Falha fechada: commit sem PR, PR sem check ou com check não aprovado reprova. Sem rede aqui.
 */

export interface PrDaRelease {
  numero: number;
  /** Conclusão do ÚLTIMO check `Veredito do the-judge` do github-actions no head da PR. */
  veredito: 'success' | 'failure' | 'ausente';
}

export interface CommitDaRelease {
  sha: string;
  /** Mais de um pai: merge (sincronização com a main ou merge de PR). */
  merge: boolean;
  /** Data do commit, ISO 8601. */
  data: string;
  prs: PrDaRelease[];
}

export interface AvaliacaoRelease {
  aprovado: boolean;
  motivos: string[];
}

/**
 * `desde`: data ISO a partir da qual o check existe (variável do dono). Commits anteriores não tinham como ter
 * veredito e ficam isentos; sem a data a conferência não roda (falha fechada).
 */
export function avaliarRelease(commits: readonly CommitDaRelease[], desde: string | undefined): AvaliacaoRelease {
  const limite = desde ? Date.parse(desde) : Number.NaN;
  if (Number.isNaN(limite)) return { aprovado: false, motivos: ['VEREDITO_JUDGE_DESDE ausente ou inválida (data ISO do início do check)'] };
  const motivos: string[] = [];
  for (const c of commits) {
    if (Date.parse(c.data) < limite) continue;
    const curto = c.sha.slice(0, 7);
    if (c.prs.length === 0) {
      if (!c.merge) motivos.push(`commit ${curto} não pertence a nenhuma PR`);
      continue; // merge sem PR é a sincronização da main
    }
    for (const pr of c.prs) {
      if (pr.veredito !== 'success') motivos.push(`PR #${pr.numero} (commit ${curto}) sem veredito aprovado (${pr.veredito})`);
    }
  }
  return { aprovado: motivos.length === 0, motivos };
}

/** Forma mínima de uma PR em `GET /commits/{sha}/pulls`. */
export interface PrDaApi {
  number: number;
  merged_at: string | null;
  base: { ref: string };
  head: { sha: string };
}

/**
 * `commits/{sha}/pulls` devolve toda PR cuja branch contém o commit, inclusive PRs abertas e a própria PR da
 * release. Só valem as PRs já mescladas e que não miram a base da conferência (a `main`).
 */
export const prsDaRelease = (prs: readonly PrDaApi[], baseDaConferencia: string): PrDaApi[] =>
  prs.filter((pr) => pr.merged_at !== null && pr.base.ref !== baseDaConferencia);
