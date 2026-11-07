import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pendenciaDeVersao } from '../../scripts/release/preflight-lib';
import { simularVersaoDosChangesets } from '../../scripts/release/simular-versao';

describe('Feature: pré-voo reprova changesets que não calculam a versão da release (EST-23)', () => {
  it('Dado release/v0.6.0 e changesets que calculam 0.6.0, Quando confiro, Então passa', () => {
    expect(
      pendenciaDeVersao('release/v0.6.0', '0.5.0', {
        pendentes: 3,
        calculada: '0.6.0',
      }),
    ).toBeNull();
  });

  it('Dado release/v0.6.0 e changesets só patch (0.5.1), Quando confiro, Então reprova nomeando as duas versões', () => {
    const erro = pendenciaDeVersao('release/v0.6.0', '0.5.0', {
      pendentes: 2,
      calculada: '0.5.1',
    });
    expect(erro).toContain('release/v0.6.0');
    expect(erro).toContain('v0.6.0');
    expect(erro).toContain('v0.5.1');
  });

  it('Dado nenhum changeset pendente, Quando confiro, Então reprova pedindo um changeset', () => {
    expect(
      pendenciaDeVersao('release/v0.6.0', '0.5.0', {
        pendentes: 0,
        calculada: '0.5.0',
      }),
    ).toContain('não há changesets pendentes');
  });

  it('Dado release já preparada (changesets consumidos) com a versão da branch, Quando confiro, Então passa no retry do corte', () => {
    expect(
      pendenciaDeVersao(
        'release/v0.6.0',
        '0.6.0',
        { pendentes: 0, calculada: '' },
        true,
      ),
    ).toBeNull();
  });

  it('Dado release já preparada com versão diferente da branch, Quando confiro, Então reprova', () => {
    expect(
      pendenciaDeVersao(
        'release/v0.6.0',
        '0.5.0',
        { pendentes: 0, calculada: '' },
        true,
      ),
    ).toContain('release já preparada');
  });

  it('Dado um hotfix cujos changesets pedem minor, Quando confiro, Então reprova', () => {
    expect(
      pendenciaDeVersao('hotfix/login', '0.5.0', {
        pendentes: 1,
        calculada: '0.6.0',
      }),
    ).toContain('hotfix só gera patch');
  });
});

describe('Feature: simulação do changeset version numa cópia descartável', () => {
  const dirs: string[] = [];
  const cwd = process.cwd();
  afterEach(() => {
    process.chdir(cwd);
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function repo(nivel: 'minor' | 'patch' | null): string {
    const dir = mkdtempSync(join(tmpdir(), 'simular-versao-'));
    dirs.push(dir);
    const git = (...a: string[]) =>
      execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    git('init', '-q', '--initial-branch=main');
    git('config', 'user.email', 't@example.invalid');
    git('config', 'user.name', 'T');
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', version: '0.5.0', private: true }),
    );
    mkdirSync(join(dir, '.changeset'));
    writeFileSync(
      join(dir, '.changeset/config.json'),
      JSON.stringify({
        changelog: false,
        commit: false,
        access: 'restricted',
        baseBranch: 'main',
        privatePackages: { version: true, tag: true },
      }),
    );
    if (nivel)
      writeFileSync(
        join(dir, '.changeset/a.md'),
        `---\n'demo': ${nivel}\n---\n\nAlgo mudou.\n`,
      );
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    symlinkSync(resolve(cwd, 'node_modules'), join(dir, 'node_modules'), 'dir');
    git('add', '-A');
    git('commit', '-qm', 'base');
    return dir;
  }

  it('Dado um changeset minor, Quando simulo, Então calcula 0.6.0 sem alterar a árvore de trabalho', () => {
    const dir = repo('minor');
    process.chdir(dir);
    expect(simularVersaoDosChangesets()).toEqual({
      pendentes: 1,
      calculada: '0.6.0',
    });
    expect(
      execFileSync('git', ['status', '--porcelain'], {
        cwd: dir,
        encoding: 'utf8',
      }),
    ).toBe('');
    expect(
      execFileSync('git', ['worktree', 'list'], { cwd: dir, encoding: 'utf8' })
        .trim()
        .split('\n'),
    ).toHaveLength(1);
  });

  it('Dado só changeset patch, Quando simulo, Então calcula 0.5.1', () => {
    process.chdir(repo('patch'));
    expect(simularVersaoDosChangesets().calculada).toBe('0.5.1');
  });

  it('Dado nenhum changeset, Quando simulo, Então devolve 0 pendentes e a versão atual', () => {
    process.chdir(repo(null));
    expect(simularVersaoDosChangesets()).toEqual({
      pendentes: 0,
      calculada: '0.5.0',
    });
  });
});
