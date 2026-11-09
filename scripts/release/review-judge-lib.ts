/**
 * Confere a review `the-judge/v1` da thread revisora no head SHA da PR (ADR-101).
 *
 * O workflow não chama modelo: o the-judge roda numa thread do Claude Code, sem custo de API, e publica o veredito como
 * review COMMENT na PR. A primeira linha do corpo é o contrato: cita `the-judge/v1` e traz o veredito `APPROVE`.
 * Todas as threads usam o login do dono, então isto NÃO prova quem escreveu a review: o risco e a mitigação por
 * processo estão no ADR-101.
 */

export const MARCA_VEREDITO = 'the-judge/v1';

export type ReviewGitHub = {
  id: number;
  commit_id: string;
  state: string;
  body: string | null;
  /** Relação do autor com o repositório (`OWNER`, `MEMBER`, `COLLABORATOR`, `NONE`...). */
  author_association: string;
};

/**
 * O repositório é público: qualquer conta externa (ou bot) consegue publicar uma review `COMMENTED`. Só vale a review
 * de quem tem a relação `OWNER` com o repositório, o login que todas as threads usam (ADR-101).
 */
export const ASSOCIACAO_CONFIAVEL = 'OWNER';
export type Veredito = 'APPROVE' | 'REJEITADO';
export type ResultadoReviews = { ok: true; reviewId: number } | { ok: false; motivo: string };

const primeiraLinha = (corpo: string | null): string => (corpo ?? '').split('\n').find((l) => l.trim() !== '') ?? '';
const RECUSA = /REQUEST_CHANGES|REJECT|BLOCK/;

/**
 * Veredito da primeira linha: `APPROVE` só se a linha cita `the-judge/v1`, traz a palavra `APPROVE` e nenhuma recusa
 * (`REQUEST_CHANGES`, `REJECT`, `BLOCK`); com a marca e sem `APPROVE` é `REJEITADO`; sem a marca não é review do the-judge.
 */
export function vereditoDoCorpo(corpo: string | null): Veredito | null {
  const linha = primeiraLinha(corpo);
  if (!linha.includes(MARCA_VEREDITO)) return null;
  return /\bAPPROVE\b/.test(linha) && !RECUSA.test(linha) ? 'APPROVE' : 'REJEITADO';
}

/**
 * `reviews` vem em ordem cronológica (`GET /pulls/{n}/reviews`). Contam só as reviews `COMMENTED` do `OWNER` no head SHA
 * que trazem a marca do the-judge; vale a mais nova: um veredito posterior que não é `APPROVE` revoga o anterior.
 */
export function avaliarReviews(reviews: readonly ReviewGitHub[], sha: string): ResultadoReviews {
  const doJudge = reviews.filter((r) => r.author_association === ASSOCIACAO_CONFIAVEL && r.commit_id === sha && r.state === 'COMMENTED' && vereditoDoCorpo(r.body) !== null);
  const atual = doJudge.at(-1);
  if (!atual) return { ok: false, motivo: `sem review '${MARCA_VEREDITO}' (COMMENT) no SHA ${sha}: a revisora do the-judge ainda não julgou este commit` };
  if (vereditoDoCorpo(atual.body) !== 'APPROVE') return { ok: false, motivo: `a review '${MARCA_VEREDITO}' mais recente do SHA não é APPROVE (review ${atual.id})` };
  return { ok: true, reviewId: atual.id };
}
