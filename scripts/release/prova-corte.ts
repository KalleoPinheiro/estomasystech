/**
 * `tsx scripts/release/prova-corte.ts --evento <pull_request|push> --base-ref <ref> --head-ref <ref>
 *  [--head-sha <sha>] --etapas ci|docker` — imprime `provado=true|false` (formato de `$GITHUB_OUTPUT`) e o
 * motivo no log. Lê o commit em teste (`HEAD`: merge ref do PR ou merge commit da `main`), o segundo pai dele
 * e os check runs desse segundo pai pela API (`GH_TOKEN` e `GITHUB_REPOSITORY`). Falha fechado (ADR-088).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import {
  avaliarProva,
  avisoDaRecusa,
  checkRunsDaSaida,
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
  // `--paginate` + `--jq` emite um objeto por linha, de todas as páginas: o selo não se perde no commit com
  // mais de 100 checks (ADR-092). Falha da API devolve vazio e o CI roda inteiro.
  const r = spawnSync(
    'gh',
    ['api', '--paginate', `repos/${repo}/commits/${sha}/check-runs?per_page=100`, '--jq', '.check_runs[]'],
    { encoding: 'utf8' },
  );
  return r.status === 0 ? checkRunsDaSaida(r.stdout) : [];
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
const aviso = avisoDaRecusa(prova, option('--etapas') || 'ci');
if (aviso !== null) {
  console.error(aviso);
  const resumo = process.env.GITHUB_STEP_SUMMARY;
  if (resumo) appendFileSync(resumo, `### Selo do corte recusado\n\n${prova.motivo}\n`);
}
console.log(`provado=${prova.provado}`);
