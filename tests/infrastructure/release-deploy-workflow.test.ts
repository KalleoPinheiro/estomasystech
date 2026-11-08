import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-095, ticket 4 (#749): `release-deploy.yml` publica a tag com o RELEASE_CUT_TOKEN e roda a
 * fumaça. Repositório público: o desenho do disparo e dos segredos é o que se prova aqui.
 */
const root = path.resolve(import.meta.dirname, '../..');
const source = readFileSync(
  path.join(root, '.github/workflows/release-deploy.yml'),
  'utf8',
);

/** Workflow sem as linhas de comentário. */
const semComentarios = source
  .split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n');

function bloco(name: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

/** Corpo do `run: |` do passo cujo nome contém `trecho`, no job `publicar`. */
function passo(trecho: string): string {
  const lines = bloco('publicar').split('\n');
  const nome = lines.findIndex((l) => l.includes(`name: ${trecho}`));
  expect(nome, `passo ${trecho}`).toBeGreaterThanOrEqual(0);
  const runAt = lines.findIndex((l, i) => i > nome && l.trim() === 'run: |');
  const body = lines.slice(runAt + 1);
  const indent = body[0]?.match(/^ */)?.[0].length ?? 0;
  const out: string[] = [];
  for (const l of body) {
    if (l.trim() && !l.startsWith(' '.repeat(indent))) break;
    out.push(l.slice(indent));
  }
  return out.join('\n');
}

function codigo(script: string, env: Record<string, string>): number {
  try {
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      env: { ...process.env, ...env, PATH: '/usr/bin:/bin' },
      stdio: 'ignore',
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

describe('Feature: release-deploy.yml (ADR-095, #749)', () => {
  it('Dado o workflow, Quando lido, Então só dispara por workflow_dispatch e nunca por pull_request_target', () => {
    const on = source.slice(
      source.indexOf('\non:'),
      source.indexOf('\nconcurrency:'),
    );
    expect(on).toMatch(/^ {2}workflow_dispatch:/m);
    expect(on.match(/^ {2}\w+:/gm)).toEqual(['  workflow_dispatch:']);
    expect(semComentarios).not.toContain('pull_request_target');
    expect(source).toMatch(
      /inputs:\n {6}version:[\s\S]*rollback:[\s\S]*dry_run:/,
    );
  });

  it('Dado a concorrência, Quando lida, Então não cancela uma publicação em andamento', () => {
    expect(source).toMatch(
      /concurrency:\n {2}group: release-deploy\n {2}cancel-in-progress: false/,
    );
  });

  it('Dado as permissões, Quando lidas, Então são só de leitura no topo e em cada job', () => {
    expect(source).toMatch(/\npermissions:\n {2}contents: read\n/);
    for (const job of ['publicar', 'fumaca']) {
      expect(bloco(job)).toMatch(/permissions:\n {6}contents: read/);
      expect(bloco(job)).toMatch(/timeout-minutes: \d+/);
    }
    expect(source).not.toMatch(/contents: write|pull-requests: write|id-token/);
  });

  it('Dado os segredos, Quando procurados, Então só o job publicar usa o RELEASE_CUT_TOKEN, por env e checkout, nunca em run', () => {
    expect(bloco('fumaca')).not.toContain('secrets.');
    expect(
      source
        .match(/secrets\.[A-Z_]+/g)
        ?.every((s) => s === 'secrets.RELEASE_CUT_TOKEN'),
    ).toBe(true);
    for (const l of source.split('\n')) {
      if (l.trim().startsWith('run:')) expect(l).not.toContain('${{');
    }
    expect(semComentarios).not.toMatch(/set -x|environment:/);
  });

  it('Dado o PAT, Quando procurado, Então não está no env do job nem no checkout e só o passo de publicar o usa com o helper do gh', () => {
    const job = bloco('publicar');
    const envDoJob = job.slice(
      job.indexOf('    env:'),
      job.indexOf('    steps:'),
    );
    expect(envDoJob).not.toContain('secrets.');
    expect(envDoJob).not.toContain('GH_TOKEN');
    expect(job).toMatch(
      /actions\/checkout[^\n]*\n\s+with:[\s\S]*?persist-credentials: false/,
    );
    expect(job).not.toMatch(/token: \$\{\{ secrets/);
    expect(job).toMatch(
      /name: Publicar tag e Release[\s\S]*?GH_TOKEN: \$\{\{ secrets\.RELEASE_CUT_TOKEN \}\}[\s\S]*?gh auth setup-git\n\s+npm run release:publish/,
    );
    expect(source.match(/secrets\.RELEASE_CUT_TOKEN/g)).toHaveLength(2);
  });

  it('Dado o job de produção, Quando procurado, Então ainda não existe (entra na #752)', () => {
    expect(source).not.toMatch(/^ {2}producao:/m);
    expect(source).not.toContain('COOLIFY');
    expect(source).not.toContain('VPS_SSH_KEY');
  });

  it('Dado o job publicar, Quando lido, Então a validação do disparo é o primeiro passo, antes do checkout', () => {
    const lines = bloco('publicar').split('\n');
    const primeiro = lines.findIndex((l) => l.includes('- name:'));
    expect(lines[primeiro]).toContain('Validar o disparo');
    expect(
      lines.findIndex((l) => l.includes('actions/checkout')),
    ).toBeGreaterThan(primeiro);
  });

  it('Dado que o job fumaca roda depois do publicar, Então depende dele e não confere versão sem pedir', () => {
    expect(bloco('fumaca')).toContain('needs: publicar');
    expect(bloco('fumaca')).toContain(
      'inputs.versao_implantada && !inputs.dry_run',
    );
  });
});

describe('Feature: validação do disparo (ADR-092)', () => {
  const validar = passo('Validar o disparo');

  it.each([
    ['refs/heads/main', '0.8.0', 0],
    ['refs/heads/feat/x', '0.8.0', 1],
    ['refs/tags/v0.8.0', '0.8.0', 1],
    ['refs/heads/main', 'v0.8.0', 1],
    ['refs/heads/main', '0.8', 1],
    ['refs/heads/main', '0.8.0; rm -rf /', 1],
    ['refs/heads/main', '', 1],
  ])('Dado ref %s e versão "%s", Então sai %i', (ref, version, esperado) => {
    expect(codigo(validar, { WORKFLOW_REF: ref, VERSION: version })).toBe(
      esperado,
    );
  });

  it('Dado RELEASE_CUT_TOKEN vazio, Quando o passo roda, Então falha; com valor, passa', () => {
    const exigir = passo('Exigir RELEASE_CUT_TOKEN');
    expect(codigo(exigir, { GH_TOKEN: '' })).toBe(1);
    expect(codigo(exigir, { GH_TOKEN: 'x' })).toBe(0);
  });
});
