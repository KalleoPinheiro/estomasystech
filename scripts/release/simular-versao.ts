/**
 * Simula o `changeset version` numa cópia descartável (worktree desanexado do HEAD) e devolve a versão que o
 * `release:prepare` calcularia, sem tocar a árvore de trabalho. Usado pelo pré-voo (e portanto pelo `dry_run`)
 * para reprovar cedo changesets cujo nível não bate com `release/vX.Y.Z` (EST-23).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { must, pendingChangesets } from './lib';

export interface VersaoSimulada {
  pendentes: number;
  calculada: string;
}

function emCopia(cwd: string, cmd: string, args: readonly string[]): void {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} falhou na cópia de simulação:\n${`${r.stdout}${r.stderr}`.trim()}`);
  }
}

export function simularVersaoDosChangesets(): VersaoSimulada {
  const pendentes = pendingChangesets(
    must('git', ['ls-files', '.changeset']).split('\n').filter(Boolean),
  ).length;
  const raiz = resolve('.');
  const copia = join(mkdtempSync(join(tmpdir(), 'preflight-versao-')), 'wt');
  try {
    must('git', ['worktree', 'add', '--detach', '-q', copia, 'HEAD']);
    if (existsSync(join(raiz, 'node_modules'))) symlinkSync(join(raiz, 'node_modules'), join(copia, 'node_modules'), 'dir');
    if (pendentes > 0) emCopia(copia, 'npx', ['--no-install', 'changeset', 'version']);
    const calculada = (JSON.parse(readFileSync(join(copia, 'package.json'), 'utf8')) as { version: string }).version;
    return { pendentes, calculada };
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', copia], { stdio: 'ignore' });
    rmSync(join(copia, '..'), { recursive: true, force: true });
    spawnSync('git', ['worktree', 'prune'], { stdio: 'ignore' });
  }
}
