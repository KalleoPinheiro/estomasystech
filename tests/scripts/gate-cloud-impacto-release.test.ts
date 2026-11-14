import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  alvosDeConfigNova,
  mutationTargetsCloud,
} from '../../scripts/gate-cloud/impacto';

const raiz = path.resolve(__dirname, '../..');
const tmp = mkdtempSync(path.join(tmpdir(), 'impacto-release-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('impacto da mutação · libs de scripts/release (#761)', () => {
  it('Dado um PR que toca só uma lib de scripts/release, Quando calcula os alvos, Então a mutação roda nela', () => {
    expect(
      mutationTargetsCloud([
        'scripts/release/check-migracao-lib.ts',
        'scripts/release/check-migracao.ts',
        'scripts/release/sub/x-lib.ts',
        'scripts/release/agentes.json',
        'scripts/other/x-lib.ts',
        'docs/a.md',
      ]),
    ).toEqual(['scripts/release/check-migracao-lib.ts']);
  });

  it('Dado o padrão novo do Stryker, Quando a config muda, Então as libs versionadas viram alvo', () => {
    expect(
      alvosDeConfigNova(
        ['scripts/release/*-lib.ts'],
        [
          'scripts/release/cut-lib.ts',
          'scripts/release/cut.ts',
          'scripts/release/posse-lib.ts',
          'src/domain/a.ts',
        ],
      ),
    ).toEqual(['scripts/release/cut-lib.ts', 'scripts/release/posse-lib.ts']);
  });

  it('Dado um PR que só muda stryker.config.json para incluir scripts/release, Quando roda o CLI, Então lista as libs (não fica skipped)', () => {
    const git = (...args: string[]): string => {
      const r = spawnSync(
        'git',
        [
          '-C',
          tmp,
          '-c',
          'user.name=t',
          '-c',
          'user.email=t@t',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        {
          encoding: 'utf8',
        },
      );
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.trim();
    };
    git('init', '-q', '-b', 'main');
    mkdirSync(path.join(tmp, 'e2e'));
    mkdirSync(path.join(tmp, 'scripts/release'), { recursive: true });
    mkdirSync(path.join(tmp, 'src'));
    writeFileSync(path.join(tmp, 'src/a.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(tmp, 'e2e/x.txt'), 'x\n');
    writeFileSync(
      path.join(tmp, 'scripts/release/cut-lib.ts'),
      'export const c = 1;\n',
    );
    writeFileSync(
      path.join(tmp, 'scripts/release/cut.ts'),
      'export const d = 1;\n',
    );
    writeFileSync(
      path.join(tmp, 'stryker.config.json'),
      JSON.stringify({ mutate: ['src/**/*.ts'] }),
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(
      path.join(tmp, 'stryker.config.json'),
      JSON.stringify({ mutate: ['src/**/*.ts', 'scripts/release/*-lib.ts'] }),
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'head');
    const r = spawnSync(
      path.join(raiz, 'node_modules/.bin/tsx'),
      [path.join(raiz, 'scripts/gate-cloud/impacto.ts'), '--mutacao'],
      {
        cwd: tmp,
        encoding: 'utf8',
        env: { ...process.env, GATE_BASE: base },
      },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('scripts/release/cut-lib.ts');
  });
});
