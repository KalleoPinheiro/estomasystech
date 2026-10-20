import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkHomologacao,
  checkVersionForBranch,
  isHotfixBranch,
  isPatchBump,
  pickOpenRelease,
  releaseBranchFor,
  versionFromReleaseBranch,
} from '../../scripts/release/lib';

describe('Feature: release/vX.Y.Z promete a versão (ADR-052)', () => {
  it('Dado o nome da branch, Quando extrai a versão, Então devolve X.Y.Z ou null', () => {
    expect(versionFromReleaseBranch('release/v0.3.0')).toBe('0.3.0');
    expect(versionFromReleaseBranch('release/v1.0.0-rc.1')).toBe('1.0.0-rc.1');
    expect(versionFromReleaseBranch('release/next')).toBeNull();
    expect(versionFromReleaseBranch('feat/release/v0.3.0')).toBeNull();
    expect(releaseBranchFor('0.3.0')).toBe('release/v0.3.0');
  });

  it('Dado a release v0.3.0, Quando os changesets calculam 0.3.0, Então passa', () => {
    expect(checkVersionForBranch('release/v0.3.0', '0.2.0', '0.3.0')).toEqual({
      ok: true,
    });
  });

  it('Dado a release v0.3.0, Quando os changesets calculam 0.2.1, Então reprova nomeando as duas', () => {
    const check = checkVersionForBranch('release/v0.3.0', '0.2.0', '0.2.1');

    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toContain('v0.3.0');
    expect(!check.ok && check.reason).toContain('v0.2.1');
  });

  it('Dado um hotfix, Então só aceita patch sobre a versão atual', () => {
    expect(isHotfixBranch('hotfix/login-503')).toBe(true);
    expect(isHotfixBranch('feat/x')).toBe(false);
    expect(isPatchBump('0.3.0', '0.3.1')).toBe(true);
    expect(isPatchBump('0.3.0', '0.4.0')).toBe(false);
    expect(checkVersionForBranch('hotfix/login-503', '0.3.0', '0.3.1').ok).toBe(
      true,
    );
    expect(checkVersionForBranch('hotfix/login-503', '0.3.0', '0.4.0').ok).toBe(
      false,
    );
  });

  it('Dado outra branch (main, feat), Quando confere, Então reprova', () => {
    expect(checkVersionForBranch('main', '0.2.0', '0.3.0').ok).toBe(false);
    expect(checkVersionForBranch('feat/x', '0.2.0', '0.3.0').ok).toBe(false);
  });
});

describe('Feature: uma release aberta por vez (ADR-052)', () => {
  it('Dado nenhuma branch release não mergeada, Então não há release aberta', () => {
    expect(pickOpenRelease([])).toEqual({ ok: true, branch: null });
  });

  it('Dado uma, Então devolve o nome sem o prefixo origin/', () => {
    expect(pickOpenRelease(['origin/release/v0.3.0'])).toEqual({
      ok: true,
      branch: 'release/v0.3.0',
    });
  });

  it('Dado duas, Então reprova listando as duas', () => {
    const open = pickOpenRelease([
      'origin/release/v0.3.0',
      'origin/release/v0.4.0',
    ]);

    expect(open.ok).toBe(false);
    expect(!open.ok && open.reason).toContain('release/v0.4.0');
  });
});

describe('Feature: PR feat → release traz seed e cenários de homologação (ADR-052)', () => {
  const src = ['src/app/page.tsx'];
  const ok = [
    '## Homologação',
    'Seed: `scripts/seed/seed.ts` — paciente sem e-mail',
    'Cenários:',
    '- Dado paciente sem e-mail, Quando agenda, Então o link aparece para copiar',
  ].join('\n');

  it('Dado PR só de docs, Quando confere, Então não exige a seção', () => {
    expect(
      checkHomologacao('', ['docs/x.md', 'scripts/release/lib.ts']).ok,
    ).toBe(true);
  });

  it('Dado PR em src sem a seção, Então reprova', () => {
    expect(checkHomologacao('## O que muda', src).ok).toBe(false);
  });

  it('Dado seed e cenários Dado/Quando/Então, Então passa', () => {
    expect(
      checkHomologacao(`## O que muda\n\n${ok}\n\n## Documentação`, src).ok,
    ).toBe(true);
  });

  it('Dado o template intocado (só comentários), Então reprova', () => {
    const template =
      '## Homologação\n<!-- Seed: x -->\n<!-- Dado Quando Então -->\nSeed:\nCenários:';
    expect(checkHomologacao(template, src).ok).toBe(false);
  });

  it('Dado seed preenchido sem cenário, Então reprova pedindo Dado/Quando/Então', () => {
    const body = '## Homologação\nSeed: n/a — sem dado novo\nCenários:';
    const check = checkHomologacao(body, src);

    expect(check.ok).toBe(false);
    expect(!check.ok && check.reason).toContain('Dado/Quando/Então');
  });

  it('Dado n/a com motivo nos dois, Então passa', () => {
    const body =
      '## Homologação\nSeed: n/a — nenhuma tela nova\nCenários: n/a — refatoração interna sem efeito visível';
    expect(checkHomologacao(body, src).ok).toBe(true);
  });

  it('Dado cenários sem a linha Seed, Então reprova', () => {
    const body = '## Homologação\nCenários:\n- Dado a, Quando b, Então c';
    expect(checkHomologacao(body, src).ok).toBe(false);
  });
});

describe('Feature: scripts de git do fluxo de release (ADR-052)', () => {
  const root = resolve(__dirname, '../..');
  let dir: string;
  let work: string;

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    }).trim();
  const commit = (file: string, content: string, message: string) => {
    mkdirSync(join(work, file, '..'), { recursive: true });
    writeFileSync(join(work, file), content);
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', message);
  };
  const run = (script: string, ...args: string[]) =>
    spawnSync('bash', [join(root, script), ...args], {
      cwd: work,
      encoding: 'utf8',
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fluxo-'));
    const remote = join(dir, 'remote.git');
    work = join(dir, 'work');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main', work]);
    git(work, 'remote', 'add', 'origin', remote);
    commit('a.txt', 'a', 'base');
    git(work, 'push', '-q', '-u', 'origin', 'main');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const openRelease = (name: string) => {
    git(work, 'switch', '-q', '-c', name, 'main');
    commit('feature.txt', 'f', 'feat na release');
    git(work, 'push', '-q', '-u', 'origin', name);
    git(work, 'switch', '-q', 'main');
  };
  const hotfixOnMain = (file = 'hotfix.txt', content = 'h') => {
    commit(file, content, 'hotfix');
    git(work, 'push', '-q', 'origin', 'main');
  };

  it('Dado hotfix na main e release aberta, Quando sincroniza, Então a release recebe a main por merge', () => {
    openRelease('release/v0.3.0');
    hotfixOnMain();

    const r = run('scripts/release/sync-main.sh', '--push');

    expect(r.status).toBe(0);
    expect(git(work, 'rev-parse', 'origin/release/v0.3.0^2')).toBe(
      git(work, 'rev-parse', 'origin/main'),
    );
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
  });

  it('Dado a release já com a main, Quando sincroniza, Então não faz nada', () => {
    openRelease('release/v0.3.0');

    const r = run('scripts/release/sync-main.sh', '--push');

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('nada a fazer');
  });

  it('Dado nenhuma release aberta, Quando sincroniza, Então sai sem erro', () => {
    const r = run('scripts/release/sync-main.sh', '--push');

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Nenhuma release aberta');
  });

  it('Dado conflito entre a main e a release, Quando sincroniza, Então aborta, não publica e avisa', () => {
    git(work, 'switch', '-q', '-c', 'release/v0.3.0', 'main');
    commit('a.txt', 'da release', 'muda a.txt na release');
    git(work, 'push', '-q', '-u', 'origin', 'release/v0.3.0');
    git(work, 'switch', '-q', 'main');
    hotfixOnMain('a.txt', 'da main');
    const before = git(work, 'rev-parse', 'origin/release/v0.3.0');

    const r = run('scripts/release/sync-main.sh', '--push');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Conflito');
    expect(git(work, 'rev-parse', 'origin/release/v0.3.0')).toBe(before);
    expect(git(work, 'status', '--porcelain')).toBe('');
  });

  it('Dado duas releases abertas, Quando sincroniza, Então reprova', () => {
    openRelease('release/v0.3.0');
    openRelease('release/v0.4.0');

    expect(run('scripts/release/sync-main.sh', '--push').status).toBe(1);
  });

  it('Dado árvore suja, Quando sincroniza, Então recusa; e argumento desconhecido também', () => {
    writeFileSync(join(work, 'sujo.txt'), 'x');

    expect(run('scripts/release/sync-main.sh').status).toBe(2);
    expect(run('scripts/release/sync-main.sh', '--nada').status).toBe(2);
    expect(run('scripts/release/sync-main.sh', '--help').status).toBe(0);
  });

  it('Dado release aberta, Quando reconstrói com --release, Então staging = release', () => {
    openRelease('release/v0.3.0');

    const r = run('scripts/staging/rebuild.sh', '--release');

    expect(r.status).toBe(0);
    expect(git(work, 'rev-parse', 'staging')).toBe(
      git(work, 'rev-parse', 'origin/release/v0.3.0'),
    );
  });

  it('Dado release já mergeada na main, Quando reconstrói com --release, Então staging = main', () => {
    openRelease('release/v0.3.0');
    git(work, 'merge', '-q', '--no-ff', '-m', 'release', 'release/v0.3.0');
    git(work, 'push', '-q', 'origin', 'main');

    const r = run('scripts/staging/rebuild.sh', '--release');

    expect(r.status).toBe(0);
    expect(git(work, 'rev-parse', 'staging')).toBe(
      git(work, 'rev-parse', 'origin/main'),
    );
  });

  it('Dado --release --push, Então publica a staging com force-with-lease', () => {
    openRelease('release/v0.3.0');

    const r = run('scripts/staging/rebuild.sh', '--release', '--push');

    expect(r.status).toBe(0);
    expect(git(work, 'rev-parse', 'origin/staging')).toBe(
      git(work, 'rev-parse', 'origin/release/v0.3.0'),
    );
  });

  it('Dado duas releases abertas, Quando reconstrói com --release, Então reprova', () => {
    openRelease('release/v0.3.0');
    openRelease('release/v0.4.0');

    expect(run('scripts/staging/rebuild.sh', '--release').status).toBe(1);
  });

  it('Dado uma branch que não existe, Quando reconstrói, Então reprova nomeando-a', () => {
    const r = run('scripts/staging/rebuild.sh', 'feat/nao-existe');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('feat/nao-existe');
  });

  it('Dado sem --release, Então staging = main (comportamento da ADR-041 preservado)', () => {
    openRelease('release/v0.3.0');

    expect(run('scripts/staging/rebuild.sh').status).toBe(0);
    expect(git(work, 'rev-parse', 'staging')).toBe(
      git(work, 'rev-parse', 'origin/main'),
    );
  });
});
