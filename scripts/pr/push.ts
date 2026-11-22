/**
 * `npm run pr:push -- <N>`: empurra a branch atual e confirma que o PR #N passou a apontar para o HEAD local
 * (ADR-117). Usa só git: `refs/pull/N/head` no origin é o head do PR segundo o GitHub.
 */
import { spawnSync } from 'node:child_process';
import { erroDepoisDoPush, numeroDoPr, recusaAntesDoPush, shaDoLsRemote } from './push-lib';

const git = (args: readonly string[]) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};

function sair(msg: string): never {
  console.error(`✗ pr:push: ${msg}`);
  process.exit(1);
}

const pr = numeroDoPr(process.argv[2]) ?? sair('uso: npm run pr:push -- <número do PR>');
const ref = `refs/pull/${pr}/head`;
const headDoPr = () => shaDoLsRemote(git(['ls-remote', 'origin', ref]).out);

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
const headLocal = git(['rev-parse', 'HEAD']).out;
const antes = headDoPr();
if (antes && antes !== headLocal) git(['fetch', '--no-tags', '--quiet', 'origin', ref]);
const descende = antes !== null && git(['merge-base', '--is-ancestor', antes, headLocal]).ok;
const recusa = recusaAntesDoPush({ branch, headLocal, headDoPr: antes, descende });
if (recusa) sair(recusa);

const push = spawnSync('git', ['push', '-u', 'origin', `HEAD:refs/heads/${branch}`], { stdio: 'inherit' });
if (push.status !== 0) sair('git push falhou');

async function conferirDepois(): Promise<void> {
  let depois = headDoPr();
  for (let i = 0; i < 10 && depois !== headLocal; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    depois = headDoPr();
  }
  const erro = erroDepoisDoPush(pr, branch, headLocal, depois);
  if (erro) sair(erro);
  console.log(`✓ PR #${pr} agora aponta para ${headLocal.slice(0, 7)} (${branch})`);
}

void conferirDepois();
