/**
 * Confere o commit status `the-judge` que a thread revisora publica no head SHA ao aprovar (ADR-101).
 *
 * O workflow não chama modelo algum: a revisão do the-judge roda numa thread do Claude Code, sem custo de API, e deixa
 * dois rastros no GitHub: uma review na PR e o status `the-judge` = success no SHA, com `target_url` apontando para ela.
 * Aqui só se confere que os dois existem e batem. Todas as threads usam o login do dono, então isto NÃO prova quem
 * publicou: o risco e a mitigação por processo estão no ADR-101.
 */

export const CONTEXTO_STATUS = 'the-judge';

export type StatusGitHub = { context: string; state: string; target_url: string | null };
export type RevisaoGitHub = { commit_id: string; state: string; body: string | null };
export type Alvo = { repo: string; pr: number; sha: string };

export type ResultadoStatus = { ok: true; revisaoId: number } | { ok: false; motivo: string };

/** `https://github.com/<repo>/pull/<n>#pullrequestreview-<id>` → `<id>`; qualquer outra URL é recusada. */
export function revisaoDaUrl(url: string | null, alvo: Pick<Alvo, 'repo' | 'pr'>): number | null {
  if (!url) return null;
  const esperado = `https://github.com/${alvo.repo}/pull/${alvo.pr}#pullrequestreview-`;
  if (!url.startsWith(esperado)) return null;
  const id = url.slice(esperado.length);
  return /^\d+$/.test(id) ? Number(id) : null;
}

/**
 * `statuses` vem do mais novo para o mais antigo (`GET /commits/{sha}/statuses`). Vale só o mais novo do contexto
 * `the-judge`: um `failure` ou `pending` posterior revoga um `success` anterior.
 */
export function avaliarStatus(statuses: readonly StatusGitHub[], alvo: Alvo): ResultadoStatus {
  const atual = statuses.find((s) => s.context === CONTEXTO_STATUS);
  if (!atual) return { ok: false, motivo: `sem o status '${CONTEXTO_STATUS}' no SHA ${alvo.sha}: a revisora do the-judge ainda não aprovou este commit` };
  if (atual.state !== 'success') return { ok: false, motivo: `o status '${CONTEXTO_STATUS}' mais recente do SHA está '${atual.state}', não 'success'` };
  const id = revisaoDaUrl(atual.target_url, alvo);
  if (id === null) return { ok: false, motivo: `o status '${CONTEXTO_STATUS}' não aponta (target_url) para uma review desta PR (#${alvo.pr})` };
  return { ok: true, revisaoId: id };
}

/**
 * A review apontada tem de ser deste SHA, ser um comentário (`COMMENTED`: o the-judge revisa por COMMENT, nunca por
 * aprovação nem por pedido de mudanças) e citar o the-judge. Devolve o motivo da recusa ou `null`.
 */
export function avaliarRevisao(revisao: RevisaoGitHub, sha: string): string | null {
  if (revisao.commit_id !== sha) return `a review apontada é do commit ${revisao.commit_id}, não do head ${sha}`;
  if (revisao.state !== 'COMMENTED') return `a review apontada está '${revisao.state}', não 'COMMENTED'`;
  if (!/the-judge/i.test(revisao.body ?? '')) return "o corpo da review apontada não cita o 'the-judge'";
  return null;
}
