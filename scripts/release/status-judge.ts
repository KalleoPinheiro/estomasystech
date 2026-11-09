/**
 * Confere o status `the-judge` do head da PR (ADR-101). Uso (no Actions, com GH_TOKEN):
 *   npx tsx scripts/release/status-judge.ts --repo <dono/nome> --pr <n> --sha <sha>
 * Sai 0 se há status success do SHA apontando para uma review do mesmo SHA; 1 em qualquer outro caso (falha fechado).
 */
import { avaliarRevisao, avaliarStatus, type RevisaoGitHub, type StatusGitHub } from './status-judge-lib';

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

async function conferir(repo: string, pr: number, sha: string): Promise<string | null> {
  const statuses = await api<StatusGitHub[]>(`/repos/${repo}/commits/${sha}/statuses?per_page=100`);
  const status = avaliarStatus(statuses, { repo, pr, sha });
  if (!status.ok) return status.motivo;
  return avaliarRevisao(await api<RevisaoGitHub>(`/repos/${repo}/pulls/${pr}/reviews/${status.revisaoId}`), sha);
}

// Sem `await` no topo: o `tsx` roda este arquivo como CJS (o pacote não é `type: module`).
conferir(arg('repo'), Number(arg('pr')), arg('sha'))
  .then((motivo) => {
    if (motivo) {
      console.error(`::error::${motivo}`);
      process.exit(1);
    }
    console.log('ok: status the-judge de success no head, com review do mesmo SHA');
  })
  .catch((e: unknown) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
