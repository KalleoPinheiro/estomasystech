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
  approvalBranch,
  checkPreparedVersion,
  consolidatedTesteAlterado,
  cutStart,
  prNumbersFromSubjects,
  type PrBody,
  releaseCommitSubject,
  releasePrBody,
  worktreePath,
} from './cut-lib';
import { must, parseRollback, sh, tagFor, versionFromReleaseBranch } from './lib';

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function step(title: string): void {
  console.log(`\n■ ${title}`);
}

/** Roda com saída no terminal; falha o corte se o comando falhar. */
function live(cmd: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} saiu com ${r.status}.`);
}

const lines = (out: string): string[] => out.split('\n').filter(Boolean);
const packageVersion = (dir = '.'): string =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version as string;

function assertBranch(): { branch: string; version: string } {
  const branch = must('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const version = versionFromReleaseBranch(branch);
  if (version === null) fail(`rode na release aberta (\`release/vX.Y.Z\`); branch atual: ${branch}.`);
  if (must('git', ['status', '--porcelain']) !== '') fail('árvore suja: faça commit ou stash antes.');
  must('git', ['fetch', '-q', 'origin', 'main', branch]);
  if (must('git', ['rev-parse', 'HEAD']) !== must('git', ['rev-parse', `origin/${branch}`]))
    fail(`${branch} local difere de origin/${branch}: atualize ou empurre antes.`);
  if (!sh('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']).ok)
    fail('a `main` tem commits que a release não tem: rode `npm run release:sync` (merge, nunca rebase).');
  return { branch, version };
}

function approvedSha(version: string): string | null {
  const out = must('git', ['ls-remote', 'origin', `refs/heads/${approvalBranch(version)}`]);
  return out.split(/\s+/)[0] || null;
}

function assertApproved(version: string): boolean {
  const start = cutStart({
    approved: approvedSha(version),
    head: must('git', ['rev-parse', 'HEAD']),
    parent: sh('git', ['rev-parse', 'HEAD^']).out,
    subject: must('git', ['log', '-1', '--format=%s']),
    version,
  });
  if (!start.ok) fail(start.reason);
  return start.prepared;
}

function batchPrs(): PrBody[] {
  const numbers = prNumbersFromSubjects(lines(must('git', ['log', '--format=%s', 'origin/main..HEAD'])));
  return numbers.map((number) => {
    const view = sh('gh', ['pr', 'view', String(number), '--json', 'body', '-q', '.body']);
    if (!view.ok) console.warn(`⚠ não li o corpo do PR #${number} com gh; o motivo dele não entra no consolidado.`);
    return { number, body: view.ok ? view.out : '' };
  });
}

function checkIntegrity(testeAlterado: string | null): void {
  const motivo = testeAlterado ? ['--motivo', testeAlterado.replace(/^TESTE-ALTERADO:\s*/, '')] : [];
  live('npx', ['tsx', 'scripts/gate/check-test-integrity.ts', 'origin/main', ...motivo]);
}

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

  step('5/5 PR release → main');
  const body = releasePrBody({ version, receipt, prs: prs.map((p) => p.number), testeAlterado });
  mkdirSync('.gate', { recursive: true });
  const bodyFile = join('.gate', `pr-release-${tagFor(version)}.md`);
  writeFileSync(bodyFile, body);
  openPr(branch, version, bodyFile);
  sh('git', ['worktree', 'remove', '--force', dir]);
  console.log(`\n${body}\nPróximo: the-judge, merge com **merge commit**, backup, \`npm run release:publish -- --rollback=${rollback}\`.`);
}

main();
