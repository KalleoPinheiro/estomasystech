/**
 * `npm run check:posse` (ADR-104): no PR, a issue citada com `Closes #N` precisa ter exatamente uma label
 * `dono:claude` ou `dono:cursor`, igual ao agente que escreveu o PR (branch e trailers). Roda no Actions com
 * `GH_TOKEN`, `GITHUB_REPOSITORY`, `HEAD_REF` e `PR_BODY`; compara com a mesma base do `check:handoff`.
 */
import { detectBase } from '../gate/base';
import { avaliarPosse, issuesFechadas } from './posse-lib';
import { must } from './lib';

const BASE = detectBase(process.env.CHANGESET_BASE || undefined);

async function labelsDaIssue(repo: string, numero: number): Promise<string[]> {
  const r = await fetch(`https://api.github.com/repos/${repo}/issues/${numero}`, {
    headers: { authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
  });
  if (!r.ok) throw new Error(`GET issue #${numero}: HTTP ${r.status}`);
  const { labels } = (await r.json()) as { labels: ({ name: string } | string)[] };
  return labels.map((l) => (typeof l === 'string' ? l : l.name));
}

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const corpo = process.env.PR_BODY ?? '';
  const mensagens = must('git', ['log', '--no-merges', '--format=%B%x00', `${BASE}..HEAD`]).split('\0').filter(Boolean);
  const labelsPorIssue = new Map<number, string[]>();
  for (const n of issuesFechadas(corpo)) labelsPorIssue.set(n, await labelsDaIssue(repo, n));
  const r = avaliarPosse({ branch: process.env.HEAD_REF ?? '', corpo, mensagensDosCommits: mensagens, labelsPorIssue });
  if (!r.aplicavel) return console.log('✓ posse: não se aplica (sem agente identificado ou PR de integração)');
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
