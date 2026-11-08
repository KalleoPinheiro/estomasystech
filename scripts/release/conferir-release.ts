/**
 * `tsx scripts/release/conferir-release.ts --base <ref> --head <sha>` (ADR-100)
 *
 * Usado só na PR release→main: lista os commits `base..head`, acha a PR de cada um e o último check
 * `Veredito do the-judge` do github-actions no head dela, e reprova se alguma não tiver aprovação.
 * Variáveis: GH_TOKEN, GITHUB_REPOSITORY, VEREDITO_JUDGE_DESDE.
 */
import { spawnSync } from 'node:child_process';
import { avaliarRelease, type CommitDaRelease, type PrDaApi, prsDaRelease } from './conferir-release-lib';

const opcao = (nome: string): string | undefined => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const repo = process.env.GITHUB_REPOSITORY;
const base = opcao('--base');
const head = opcao('--head');
if (!repo || !base || !head) {
  console.error('✗ passe --base <ref> --head <sha> e defina GITHUB_REPOSITORY');
  process.exit(1);
}

function api<T>(caminho: string): T {
  const r = spawnSync('gh', ['api', '--paginate', '--slurp', caminho], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`gh api ${caminho}: ${r.stderr}`);
  return JSON.parse(r.stdout) as T;
}

interface CheckRun {
  name: string;
  conclusion: string | null;
  completed_at: string | null;
  app: { slug: string } | null;
}

function vereditoDoHead(sha: string): 'success' | 'failure' | 'ausente' {
  const paginas = api<{ check_runs: CheckRun[] }[]>(`repos/${repo}/commits/${sha}/check-runs?per_page=100`);
  const do_actions = paginas
    .flatMap((p) => p.check_runs)
    .filter((c) => c.name === 'Veredito do the-judge' && c.app?.slug === 'github-actions' && c.completed_at)
    .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''));
  const ultimo = do_actions.at(-1);
  if (!ultimo) return 'ausente';
  return ultimo.conclusion === 'success' ? 'success' : 'failure';
}

const comparacao = api<{ commits: { sha: string; parents: unknown[]; commit: { committer: { date: string } } }[] }[]>(
  `repos/${repo}/compare/${base}...${head}?per_page=100`,
);
const commits: CommitDaRelease[] = comparacao
  .flatMap((p) => p.commits)
  .map((c) => ({
    sha: c.sha,
    merge: c.parents.length > 1,
    data: c.commit.committer.date,
    prs: prsDaRelease(api<PrDaApi[]>(`repos/${repo}/commits/${c.sha}/pulls`).flat(), base)
      .map((pr) => ({ numero: pr.number, veredito: vereditoDoHead(pr.head.sha) })),
  }));

const r = avaliarRelease(commits, process.env.VEREDITO_JUDGE_DESDE);
console.log(r.aprovado ? `✓ ${commits.length} commit(s) da release com veredito aprovado` : `✗ release sem veredito completo:\n${r.motivos.map((m) => `  - ${m}`).join('\n')}`);
process.exit(r.aprovado ? 0 : 1);
