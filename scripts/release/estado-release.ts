/**
 * `npm run estado` (ADR-104): gera `reports/estado-release.md` (ignorado pelo git) com as issues abertas por dono,
 * as vagas ocupadas e os PRs abertos. Só leitura. Variáveis: `GH_TOKEN` (opcional em repositório público),
 * `GITHUB_REPOSITORY` (padrão KalleoPinheiro/estomasystech). Uso: `npm run estado [-- --release v0.7.0]`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { type ItemEstado, renderEstado } from './posse-lib';

const repo = process.env.GITHUB_REPOSITORY || 'KalleoPinheiro/estomasystech';
const i = process.argv.indexOf('--release');
const release = i < 0 ? 'aberta' : (process.argv[i + 1] ?? 'aberta');

type Bruto = { number: number; title: string; labels: { name: string }[]; draft?: boolean; pull_request?: unknown };

async function lista(caminho: string): Promise<Bruto[]> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (process.env.GH_TOKEN) headers.authorization = `Bearer ${process.env.GH_TOKEN}`;
  const r = await fetch(`https://api.github.com/repos/${repo}/${caminho}${caminho.includes('?') ? '&' : '?'}per_page=100`, { headers });
  if (!r.ok) throw new Error(`GET ${caminho}: HTTP ${r.status}`);
  return (await r.json()) as Bruto[];
}

const item = (b: Bruto): ItemEstado => ({ numero: b.number, titulo: b.title, labels: b.labels.map((l) => l.name), rascunho: b.draft });

async function main(): Promise<void> {
  const issues = (await lista('issues?state=open')).filter((b) => !b.pull_request).map(item);
  const prs = (await lista('pulls?state=open')).map(item);
  mkdirSync('reports', { recursive: true });
  writeFileSync('reports/estado-release.md', renderEstado(release, issues, prs));
  console.log('estado: reports/estado-release.md');
}

main().catch((e: unknown) => {
  console.error(`✗ estado: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
