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
  /** Primeira linha da mensagem do commit. */
  assunto?: string;
  /** Commit pertence à PR sob conferência (a release→main ou um `hotfix/*` → main): branch dela. */
  prAtual?: { headRef: string };
  prs: PrDaRelease[];
}

export interface AvaliacaoRelease {
  aprovado: boolean;
  motivos: string[];
}

/** Commit do robô do `release:prepare` (`chore(release): vX.Y.Z`), que só existe na branch da própria release. */
const ASSUNTO_DO_ROBO = /^chore\(release\): v\d+\.\d+\.\d+/;

/**
 * Isenção dos commits da PR sob conferência: não têm PR própria para ter veredito (a PR deles é a que está sendo
 * conferida). Vale só para o commit do robô na branch da release e para qualquer commit de PR `hotfix/*` → `main`.
 * Commit comum direto na branch da release continua reprovando.
 */
const daPrAtualIsento = (c: CommitDaRelease): boolean =>
  c.prAtual !== undefined && (c.prAtual.headRef.startsWith('hotfix/') || ASSUNTO_DO_ROBO.test(c.assunto ?? ''));

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
      if (daPrAtualIsento(c)) continue;
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
  head: { sha: string; ref: string };
}

/**
 * `commits/{sha}/pulls` devolve toda PR cuja branch contém o commit, inclusive PRs abertas e a própria PR da
 * release. Só valem as PRs já mescladas e que não miram a base da conferência (a `main`).
 */
export const prsDaRelease = (prs: readonly PrDaApi[], baseDaConferencia: string): PrDaApi[] =>
  prs.filter((pr) => pr.merged_at !== null && pr.base.ref !== baseDaConferencia);

/** A PR sob conferência entre as PRs do commit: aberta contra a base da conferência, com o head conferido. */
export const prAtualDoCommit = (prs: readonly PrDaApi[], baseDaConferencia: string, headConferido: string): { headRef: string } | undefined => {
  const pr = prs.find((p) => p.base.ref === baseDaConferencia && p.head.sha === headConferido);
  return pr ? { headRef: pr.head.ref } : undefined;
};
