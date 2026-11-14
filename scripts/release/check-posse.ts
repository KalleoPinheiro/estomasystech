/**
 * `npm run check:posse` (ADR-104): no PR, a issue citada com `Closes #N` (ou `(#N)` no título) precisa ter exatamente
 * uma label `dono:claude` ou `dono:cursor`, igual ao agente que escreveu o PR (branch e trailers). Roda no Actions com
 * `GH_TOKEN` e `GITHUB_REPOSITORY`, com `--pr <n> --head-ref <branch>`; o corpo e o título vêm da API (um re-run enxerga a edição).
 * Compara com a mesma base do `check:handoff`.
 */
import { detectBase } from '../gate/base';
import { must } from './lib';
import { dadosDoPr, labelsDaIssue } from './posse-api';
import { avaliarPosse, issuesDoPr } from './posse-lib';

const BASE = detectBase(process.env.CHANGESET_BASE || undefined);

function arg(nome: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  const v = i < 0 ? undefined : process.argv[i + 1];
  if (!v) {
    console.error(`✗ falta --${nome}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GH_TOKEN ?? '';
  const { corpo, titulo } = await dadosDoPr(fetch, repo, Number(arg('pr')), token);
  const mensagens = must('git', ['log', '--no-merges', '--format=%B%x00', `${BASE}..HEAD`]).split('\0').filter(Boolean);
  const labelsPorIssue = new Map<number, string[]>();
  for (const n of issuesDoPr(corpo, titulo)) labelsPorIssue.set(n, await labelsDaIssue(fetch, repo, n, token));
  const r = avaliarPosse({ branch: arg('head-ref'), corpo, titulo, mensagensDosCommits: mensagens, labelsPorIssue });
  if (!r.aplicavel) return console.log('✓ posse: não se aplica (PR de integração)');
  if (!r.ok) {
    console.error(`✗ posse (ADR-104):\n${r.motivos.map((m) => `  - ${m}`).join('\n')}`);
    process.exit(1);
  }
  console.log('✓ posse ok');
}

main().catch((e: unknown) => {
  console.error(`✗ posse: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
