/**
 * `tsx scripts/release/prova-corte.ts --evento <pull_request|push> --base-ref <ref> --head-ref <ref>
 *  [--head-sha <sha>] --etapas ci|docker` — imprime `provado=true|false` (formato de `$GITHUB_OUTPUT`) e o
 * motivo no log. Lê o commit em teste (`HEAD`: merge ref do PR ou merge commit da `main`), o segundo pai dele
 * e os check runs desse segundo pai pela API (`GH_TOKEN` e `GITHUB_REPOSITORY`). Falha fechado (ADR-088).
 */
import { spawnSync } from 'node:child_process';
import {
  avaliarProva,
  type CheckRunLite,
  ETAPAS_CI,
  ETAPAS_DOCKER,
} from './prova-corte-lib';

function option(name: string): string {
  const i = process.argv.indexOf(name);
  return (i >= 0 ? process.argv[i + 1] : undefined) ?? '';
}

function git(...args: string[]): string {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function checkRuns(sha: string): CheckRunLite[] {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  if (sha === '' || repo === '') return [];
  const r = spawnSync('gh', ['api', `repos/${repo}/commits/${sha}/check-runs?per_page=100`, '--jq', '.check_runs'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return [];
  try {
    const parsed: unknown = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? (parsed as CheckRunLite[]) : [];
  } catch {
    return [];
  }
}

const segundoPai = git('rev-parse', '--verify', '--quiet', 'HEAD^2');
const exigidas = option('--etapas') === 'docker' ? ETAPAS_DOCKER : ETAPAS_CI;
const prova = avaliarProva({
  evento: option('--evento'),
  baseRef: option('--base-ref'),
  headRef: option('--head-ref'),
  headShaEvento: option('--head-sha'),
  segundoPai,
  arvoreCommit: git('rev-parse', 'HEAD^{tree}'),
  arvoreSegundoPai: segundoPai === '' ? '' : git('rev-parse', `${segundoPai}^{tree}`),
  checkRuns: checkRuns(segundoPai),
  etapasExigidas: exigidas,
});
console.error(`prova do corte (${option('--etapas') || 'ci'}): ${prova.provado ? 'sim' : 'não'} — ${prova.motivo}`);
console.log(`provado=${prova.provado}`);
