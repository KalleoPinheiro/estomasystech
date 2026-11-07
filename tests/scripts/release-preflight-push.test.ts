import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

/** Clone com um pre-push que sempre reprova, como o `check:testes` sem o motivo do lote. */
function cloneComHookQueReprova(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'preflight-push-'));
  dirs.push(raiz);
  const origem = join(raiz, 'origem.git');
  const clone = join(raiz, 'clone');
  git(raiz, 'init', '--bare', '--initial-branch=main', origem);
  git(raiz, 'clone', origem, clone);
  git(clone, 'config', 'user.email', 'teste@example.invalid');
  git(clone, 'config', 'user.name', 'teste');
  git(clone, 'commit', '--allow-empty', '-m', 'inicio');
  const hook = join(clone, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, '#!/bin/sh\necho "SEM MOTIVO" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  return clone;
}

describe('pré-voo: teste de permissão de push (ADR-092)', () => {
  it('Dado um pre-push que reprova, Quando o push de teste usa --no-verify, Então o hook não o barra', () => {
    const clone = cloneComHookQueReprova();
    const r = spawnSync(
      'git',
      [
        'push',
        '--dry-run',
        '--no-verify',
        'origin',
        'HEAD:refs/heads/release/v9.9.9',
      ],
      {
        cwd: clone,
        encoding: 'utf8',
      },
    );
    expect(r.status).toBe(0);
  });

  it('Dado um pre-push que reprova, Quando o push de teste não usa --no-verify, Então o hook o barra (a causa da falha do dry_run)', () => {
    const clone = cloneComHookQueReprova();
    const r = spawnSync(
      'git',
      ['push', '--dry-run', 'origin', 'HEAD:refs/heads/release/v9.9.9'],
      {
        cwd: clone,
        encoding: 'utf8',
      },
    );
    expect(r.status).not.toBe(0);
  });

  it('Dado o preflight.ts, Quando ele testa a permissão de escrita, Então o push de teste passa --no-verify', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'scripts/release/preflight.ts'),
      'utf8',
    );
    expect(fonte).toMatch(/\['push', '--dry-run', '--no-verify', 'origin'/);
  });
});
