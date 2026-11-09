/**
 * Confere a review do the-judge no head da PR (ADR-101). Uso (no Actions, com GH_TOKEN):
 *   npx tsx scripts/release/review-judge.ts --repo <dono/nome> --pr <n> --sha <sha>
 * Sai 0 se a review `the-judge/v1` mais nova do SHA (COMMENT) é APPROVE; 1 em qualquer outro caso (falha fechado).
 */
import { avaliarReviews, type ReviewGitHub } from './review-judge-lib';

function arg(nome: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  const v = i < 0 ? undefined : process.argv[i + 1];
  if (!v) {
    console.error(`✗ falta --${nome}`);
    process.exit(1);
  }
  return v;
}

async function api<T>(caminho: string): Promise<T> {
  const r = await fetch(`https://api.github.com${caminho}`, {
    headers: { authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  if (!r.ok) throw new Error(`GET ${caminho}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

const POR_PAGINA = 100;

async function todasAsReviews(repo: string, pr: number): Promise<ReviewGitHub[]> {
  const todas: ReviewGitHub[] = [];
  for (let pagina = 1; ; pagina++) {
    const lote = await api<ReviewGitHub[]>(`/repos/${repo}/pulls/${pr}/reviews?per_page=${POR_PAGINA}&page=${pagina}`);
    todas.push(...lote);
    if (lote.length < POR_PAGINA) return todas;
  }
}

async function conferir(repo: string, pr: number, sha: string): Promise<string | null> {
  const r = avaliarReviews(await todasAsReviews(repo, pr), sha);
  return r.ok ? null : r.motivo;
}

// Sem `await` no topo: o `tsx` roda este arquivo como CJS (o pacote não é `type: module`).
conferir(arg('repo'), Number(arg('pr')), arg('sha'))
  .then((motivo) => {
    if (motivo) {
      console.error(`::error::${motivo}`);
      process.exit(1);
    }
    console.log('ok: review the-judge/v1 APPROVE no head');
  })
  .catch((e: unknown) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
