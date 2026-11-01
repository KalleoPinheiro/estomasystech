import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Feature: rebuild da staging dispara deploy na Vercel', () => {
  const root = resolve(__dirname, '../..');
  let dir: string;
  let work: string;

  // why: isolar do git do usuário (gpgsign, hooks, fsync) tira segundos de cada comando
  // sob carga e deixa o teste igual em qualquer máquina (#604).
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'core.fsync',
    GIT_CONFIG_VALUE_0: 'none',
    GIT_CONFIG_KEY_1: 'gc.auto',
    GIT_CONFIG_VALUE_1: '0',
    GIT_CONFIG_KEY_2: 'commit.gpgsign',
    GIT_CONFIG_VALUE_2: 'false',
  };

  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: work,
      encoding: 'utf8',
      env: gitEnv,
    }).trim();
  const commit = (file: string, message: string) => {
    mkdirSync(join(work, file, '..'), { recursive: true });
    writeFileSync(join(work, file), message);
    git('add', '-A');
    git('commit', '-q', '-m', message);
  };
  const rebuild = (...args: string[]) =>
    spawnSync('bash', [join(root, 'scripts/staging/rebuild.sh'), ...args], {
      cwd: work,
      encoding: 'utf8',
      env: gitEnv,
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'staging-'));
    const remote = join(dir, 'remote.git');
    work = join(dir, 'work');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main', work]);
    git('remote', 'add', 'origin', remote);
    commit('a.txt', 'base');
    git('push', '-q', '-u', 'origin', 'main');
    git('switch', '-q', '-c', 'release/v0.3.0', 'main');
    commit('f.txt', 'feat na release');
    git('push', '-q', '-u', 'origin', 'release/v0.3.0');
    git('switch', '-q', 'main');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('Dado SHA da release já existente, Quando reconstrói com --deploy --push, Então a staging remota ganha um commit vazio sobre a release', () => {
    const r = rebuild('--release', '--deploy', '--push');

    expect(r.status).toBe(0);
    const release = git('rev-parse', 'origin/release/v0.3.0');
    expect(git('rev-parse', 'origin/staging')).not.toBe(release);
    expect(git('rev-parse', 'origin/staging^')).toBe(release);
    expect(git('log', '-1', '--format=%s', 'origin/staging')).toBe(
      'chore(staging): dispara deploy de homologação',
    );
    expect(git('diff', '--stat', release, 'origin/staging')).toBe('');
  });

  it('Dado --push, Quando a staging local é criada, Então o upstream é origin/staging e nunca a release', () => {
    expect(rebuild('--release', '--deploy', '--push').status).toBe(0);

    expect(git('rev-parse', '--abbrev-ref', 'staging@{upstream}')).toBe(
      'origin/staging',
    );
  });

  it('Dado a staging local sem --push, Então não herda upstream da release', () => {
    expect(rebuild('--release', '--deploy').status).toBe(0);

    expect(() =>
      git('rev-parse', '--abbrev-ref', 'staging@{upstream}'),
    ).toThrow();
  });

  it('Dado a release já na staging remota, Quando reconstrói de novo com --deploy, Então gera outro SHA', () => {
    rebuild('--release', '--deploy', '--push');
    const first = git('rev-parse', 'origin/staging');
    execFileSync('sleep', ['1']);

    expect(rebuild('--release', '--deploy', '--push').status).toBe(0);

    expect(git('rev-parse', 'origin/staging')).not.toBe(first);
  });

  it('Dado SHA já existente, Quando reconstrói sem --deploy, Então a staging é igual à base (comportamento anterior)', () => {
    expect(rebuild('--release', '--push').status).toBe(0);

    expect(git('rev-parse', 'origin/staging')).toBe(
      git('rev-parse', 'origin/release/v0.3.0'),
    );
  });
});
