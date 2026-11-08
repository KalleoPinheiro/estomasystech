import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('Feature: a homologação escolhe a release com --release=release/vX.Y.Z (ADR-099)', () => {
  let dir: string;
  let work: string;
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.fsync',
    GIT_CONFIG_VALUE_0: 'none',
    GIT_CONFIG_KEY_1: 'commit.gpgsign',
    GIT_CONFIG_VALUE_1: 'false',
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
    dir = mkdtempSync(join(tmpdir(), 'staging-rel-'));
    const remote = join(dir, 'remote.git');
    work = join(dir, 'work');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main', work]);
    git('remote', 'add', 'origin', remote);
    commit('a.txt', 'base');
    git('push', '-q', '-u', 'origin', 'main');
    for (const v of ['v0.3.0', 'v0.4.0']) {
      git('switch', '-q', '-c', `release/${v}`, 'main');
      commit(`${v}.txt`, `feat ${v}`);
      git('push', '-q', '-u', 'origin', `release/${v}`);
      git('switch', '-q', 'main');
    }
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('Dado duas releases abertas, Quando --release sem valor, Então aborta (uma por vez)', () => {
    const r = rebuild('--release', '--push');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Mais de uma release aberta');
  });

  it('Dado duas releases abertas, Quando --release=release/v0.3.0 --push, Então a staging = essa release', () => {
    const r = rebuild('--release=release/v0.3.0', '--push');

    expect(r.status).toBe(0);
    expect(git('rev-parse', 'origin/staging')).toBe(
      git('rev-parse', 'origin/release/v0.3.0'),
    );
  });

  it('Dado release inexistente, Quando --release=release/v9.9.9, Então falha sem publicar', () => {
    const r = rebuild('--release=release/v9.9.9', '--push');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Release inexistente');
    expect(git('ls-remote', '--heads', 'origin', 'staging')).toBe('');
  });

  it('Dado release já mergeada na main, Quando --release=release/v0.3.0, Então não há o que homologar', () => {
    git('merge', '-q', '--no-ff', '-m', 'merge', 'origin/release/v0.3.0');
    git('push', '-q', 'origin', 'main');

    const r = rebuild('--release=release/v0.3.0', '--push');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('já está na main');
  });

  it('Dado um valor que não é release/vX.Y.Z, Então recusa com status 2', () => {
    const r = rebuild('--release=feat/x');

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Release inválida');
  });
});

describe('Feature: o job homologar só grava a marca depois da validação verde (ADR-099)', () => {
  const yml = readFileSync(join(root, '.github/workflows/staging.yml'), 'utf8');
  const homologar = yml.slice(
    yml.indexOf('\n  homologar:'),
    yml.indexOf('\n  smoke:'),
  );
  const pos = (needle: string) => homologar.indexOf(needle);

  it('Dado o workflow, Então a marca vem depois da validação logada e usa o RELEASE_CUT_TOKEN', () => {
    expect(pos('validacao-logada.mjs')).toBeGreaterThan(-1);
    expect(pos('Gravar a marca de homologação')).toBeGreaterThan(
      pos('validacao-logada.mjs'),
    );
    expect(homologar.slice(pos('Gravar a marca de homologação'))).toContain(
      'secrets.RELEASE_CUT_TOKEN',
    );
  });

  it('Dado o workflow, Então o job só roda em dispatch com homologar e release_branch, e confere se a release andou', () => {
    expect(homologar).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.homologar && inputs.release_branch != ''",
    );
    expect(homologar).toContain('A release andou');
  });

  it('Dado o workflow, Então a marca não usa if: always() nem continue-on-error', () => {
    const marca = homologar.slice(pos('Gravar a marca de homologação'));
    expect(marca).not.toContain('always()');
    expect(homologar).not.toContain('continue-on-error');
  });

  it('Dado o workflow, Então exige os três segredos antes de qualquer passo caro', () => {
    for (const s of [
      'STAGING_SEED_PASSWORD',
      'VERCEL_AUTOMATION_BYPASS_SECRET',
      'RELEASE_CUT_TOKEN',
    ])
      expect(homologar.slice(0, pos('Esperar o deploy'))).toContain(s);
  });
});

describe('Feature: a marca só vale para a árvore da release (ADR-099)', () => {
  const yml = readFileSync(join(root, '.github/workflows/staging.yml'), 'utf8');

  it('Dado homologar, Então o workflow valida release_branch por regex e recusa branches extras', () => {
    expect(yml).toContain('^release/v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(yml).toContain('homologar com branches extras');
    expect(yml).toContain('homologar sem release');
  });

  it('Dado homologar, Então compara a árvore da staging com a da release antes de esperar o deploy e de gravar a marca', () => {
    const arvore = yml.indexOf('A staging publicada tem a árvore da release');
    expect(arvore).toBeGreaterThan(-1);
    expect(arvore).toBeLessThan(yml.indexOf('Esperar o deploy de Production'));
    expect(yml.slice(yml.indexOf('Gravar a marca de homologação'))).toContain(
      '^{tree}',
    );
  });
});

describe('Feature: a validação logada falha quando não percorre nada (ADR-099)', () => {
  const ok = {
    role: 'admin',
    status: 200,
    overflow: 0,
    final: '/',
    route: '/',
    problems: [],
    apiFail: [],
  };

  it('Dado zero páginas, Quando avalia, Então há erro', async () => {
    const { avaliar } = await import(
      '../../scripts/staging/validacao-logada-lib.mjs'
    );
    expect(avaliar([], ['admin']).erros).toContain(
      'nenhuma página foi percorrida',
    );
  });

  it('Dado um papel sem rotas, Quando avalia, Então nomeia o papel', async () => {
    const { avaliar } = await import(
      '../../scripts/staging/validacao-logada-lib.mjs'
    );
    const { erros } = avaliar([ok], ['admin', 'atendente']);
    expect(erros).toEqual(['o papel atendente não percorreu nenhuma rota']);
  });

  it('Dado páginas limpas de todos os papéis, Então não há erro nem achado', async () => {
    const { avaliar } = await import(
      '../../scripts/staging/validacao-logada-lib.mjs'
    );
    const r = avaliar(
      [ok, { ...ok, role: 'atendente' }],
      ['admin', 'atendente'],
    );
    expect(r).toEqual({ bad: [], erros: [] });
  });

  it('Dado console com erro, redirecionamento, 4xx ou rolagem, Então vira achado', async () => {
    const { avaliar } = await import(
      '../../scripts/staging/validacao-logada-lib.mjs'
    );
    const ruins = [
      { ...ok, problems: ['[console.error] x'] },
      { ...ok, apiFail: ['GET /api/x 500'] },
      { ...ok, overflow: 3 },
      { ...ok, status: 404 },
      { ...ok, final: '/login' },
    ];
    expect(avaliar(ruins, ['admin']).bad).toHaveLength(5);
  });
});
