/**
 * `npm run release:cut -- --rollback=redeploy|backup` — corta a release aberta em um comando, na
 * ordem do ADR-071 (decisão de @KalleoPinheiro depois da v0.2.0, em que o gate rodou quatro vezes):
 *
 * 1. Pré-condições: está na `release/vX.Y.Z`, árvore limpa, igual ao origin, com a `main` dentro,
 *    e a marca `homologacao/vX.Y.Z` aponta para este SHA. O TESTE-ALTERADO do lote é consolidado
 *    dos PRs mergeados e a integridade dos testes contra a `main` roda já aqui, antes de congelar.
 * 2. `release:prepare` PRIMEIRO (versão, CHANGELOG, Release em rascunho). Nenhum commit depois.
 * 3. Worktree limpo do SHA final, ao lado do clone, com `npm ci`.
 * 4. Gate da release UMA vez (`GATE_PERFIL=release`, base `origin/main`; ambiente fixado pelo gate).
 * 5. Corpo do PR `release → main` com o recibo e o TESTE-ALTERADO consolidado; abre o PR com `gh`
 *    quando houver, senão imprime.
 *
 * Roda igual no WSL e no GitHub Actions (com `GH_TOKEN`). Nova execução depois de um gate que falhou
 * por ambiente reconhece a release já preparada e não versiona de novo.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyReceipt } from '../gate/receipt';
import {
  checkPreparedVersion,
  consolidatedTesteAlterado,
  releaseCommitSubject,
  releasePrBody,
  worktreePath,
} from './cut-lib';
import { assertApproved, assertBranch, batchPrs, checkIntegrity, fail, live, step } from './cut-pre';
import { must, parseRollback, sh, tagFor } from './lib';
import { SELO_NOME } from './prova-corte-lib';
import { selarCorte } from './selo';

const packageVersion = (dir = '.'): string =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version as string;

/** O `git push` do `release:prepare` passa pelo `pre-push` (regra 8), que só lê o motivo de `.gate/motivo-teste.txt`. */
function writeMotivoParaOPush(testeAlterado: string | null): void {
  if (!testeAlterado) return;
  mkdirSync('.gate', { recursive: true });
  writeFileSync('.gate/motivo-teste.txt', testeAlterado.replace(/^TESTE-ALTERADO:\s*/, ''));
}

function prepare(rollback: string, version: string): void {
  live('npm', ['run', 'release:prepare', '--', `--rollback=${rollback}`]);
  const check = checkPreparedVersion(version, packageVersion());
  if (!check.ok) fail(check.reason);
  if (must('git', ['status', '--porcelain']) !== '') fail('o release:prepare deixou a árvore suja.');
}

function freshWorktree(version: string): string {
  const dir = worktreePath(must('git', ['rev-parse', '--show-toplevel']), version);
  if (existsSync(dir)) sh('git', ['worktree', 'remove', '--force', dir]);
  sh('git', ['worktree', 'prune']);
  must('git', ['worktree', 'add', '--detach', dir, 'HEAD']);
  return dir;
}

function runGate(dir: string, testeAlterado: string | null): string {
  live('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir });
  mkdirSync(join(dir, '.gate'), { recursive: true });
  if (testeAlterado)
    writeFileSync(join(dir, '.gate/motivo-teste.txt'), testeAlterado.replace(/^TESTE-ALTERADO:\s*/, ''));
  const env = { ...process.env, GATE_PERFIL: 'release', GATE_BASE: 'origin/main' };
  const gate = spawnSync('npm', ['run', 'gate:local'], { cwd: dir, env, stdio: 'inherit' });
  const receiptFile = join(dir, '.gate/recibo.txt');
  const receipt = existsSync(receiptFile) ? readFileSync(receiptFile, 'utf8').trim() : '';
  if (gate.status !== 0)
    fail(`o gate da release falhou (worktree mantido em ${dir}). ${receipt}\nCorrija a causa e rode o release:cut de novo.`);
  return receipt;
}

function openPr(branch: string, version: string, bodyFile: string): void {
  const tag = tagFor(version);
  const existing = sh('gh', ['pr', 'view', branch, '--json', 'url,state', '-q', 'select(.state=="OPEN") | .url']);
  const r =
    existing.ok && existing.out !== ''
      ? sh('gh', ['pr', 'edit', branch, '--body-file', bodyFile])
      : sh('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', releaseCommitSubject(version), '--body-file', bodyFile]);
  console.log(
    r.ok
      ? `✓ PR ${tag} → main: ${existing.out || r.out.split('\n').at(-1)}`
      : `⚠ não abri o PR com gh (${r.out.split('\n')[0]}). Abra "${releaseCommitSubject(version)}" contra a main com o corpo de ${bodyFile}.`,
  );
}

function main(): void {
  const rollback = parseRollback(process.argv.find((a) => a.startsWith('--rollback='))?.slice('--rollback='.length));
  if (rollback === null) fail('declare o rollback do lote: --rollback=redeploy ou --rollback=backup (ADR-039).');

  step('1/5 Pré-condições');
  const { branch, version } = assertBranch();
  const prepared = assertApproved(version);
  const prs = batchPrs();
  const testeAlterado = consolidatedTesteAlterado(prs);
  checkIntegrity(testeAlterado);

  step(prepared ? '2/5 release:prepare já feito neste SHA homologado; segue' : '2/5 release:prepare');
  if (!prepared) {
    writeMotivoParaOPush(testeAlterado);
    prepare(rollback, version);
  }
  const sha = must('git', ['rev-parse', 'HEAD']);

  step('3/5 Worktree limpo');
  const dir = freshWorktree(version);

  step('4/5 Gate da release (uma vez)');
  const receipt = runGate(dir, testeAlterado);
  const check = verifyReceipt(receipt, sha, [], branch);
  if (!check.ok) fail(`recibo inválido: ${check.reason}`);

  step('5/5 Selo e PR release → main');
  const selo = selarCorte({
    recibo: receipt,
    extras: (process.env.RELEASE_CUT_ETAPAS_EXTRAS ?? '').split(',').filter(Boolean),
    token: process.env.SELO_TOKEN ?? '',
    repo: process.env.GITHUB_REPOSITORY ?? '',
  });
  console.log(`${selo.feita ? '✓' : '⚠'} selo ${SELO_NOME}: ${selo.motivo}`);
  const body = releasePrBody({ version, receipt, prs: prs.map((p) => p.number), testeAlterado });
  mkdirSync('.gate', { recursive: true });
  const bodyFile = join('.gate', `pr-release-${tagFor(version)}.md`);
  writeFileSync(bodyFile, body);
  openPr(branch, version, bodyFile);
  sh('git', ['worktree', 'remove', '--force', dir]);
  console.log(`\n${body}\nPróximo: the-judge, merge com **merge commit**, backup, \`npm run release:publish -- --rollback=${rollback}\`.`);
}

main();
