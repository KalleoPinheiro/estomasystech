/**
 * Pré-condições do `release:cut` (ADR-071), compartilhadas com o `release:preflight` (ADR-088): o pré-voo roda
 * exatamente as mesmas checagens, em segundos, antes do gate de ~42 min.
 */
import { spawnSync } from 'node:child_process';
import { approvalBranch, cutStart, type PrBody, prNumbersFromSubjects } from './cut-lib';
import { must, sh, versionFromReleaseBranch } from './lib';

export function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

export function step(title: string): void {
  console.log(`\n■ ${title}`);
}

/** Roda com saída no terminal; falha o corte se o comando falhar. */
export function live(cmd: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} saiu com ${r.status}.`);
}

export const lines = (out: string): string[] => out.split('\n').filter(Boolean);

export function assertBranch(): { branch: string; version: string } {
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

export function approvedSha(version: string): string | null {
  const out = must('git', ['ls-remote', 'origin', `refs/heads/${approvalBranch(version)}`]);
  return out.split(/\s+/)[0] || null;
}

export function assertApproved(version: string): boolean {
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

export function batchPrs(): PrBody[] {
  const numbers = prNumbersFromSubjects(lines(must('git', ['log', '--format=%s', 'origin/main..HEAD'])));
  return numbers.map((number) => {
    const view = sh('gh', ['pr', 'view', String(number), '--json', 'body', '-q', '.body']);
    if (!view.ok) console.warn(`⚠ não li o corpo do PR #${number} com gh; o motivo dele não entra no consolidado.`);
    return { number, body: view.ok ? view.out : '' };
  });
}

export function checkIntegrity(testeAlterado: string | null): void {
  const motivo = testeAlterado ? ['--motivo', testeAlterado.replace(/^TESTE-ALTERADO:\s*/, '')] : [];
  live('npx', ['tsx', 'scripts/gate/check-test-integrity.ts', 'origin/main', ...motivo]);
}
