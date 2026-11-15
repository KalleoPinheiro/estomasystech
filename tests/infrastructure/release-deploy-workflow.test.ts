import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * ADR-095 (#749, #750 a #752 e #851): `release-deploy.yml` valida o SHA (staging), espera o clique do
 * Environment `producao`, faz backup, tag e deploy e roda a fumaça. Repositório público: o desenho do
 * disparo, da ordem e dos segredos é o que se prova aqui.
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

/** Corpo do `run: |` do passo cujo nome contém `trecho`, no job `job`. */
function passo(job: string, trecho: string): string {
  const lines = bloco(job).split('\n');
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
    for (const job of ['validar', 'producao', 'fumaca']) {
      expect(bloco(job)).toMatch(/permissions:\n {6}contents: read/);
      expect(bloco(job)).toMatch(/timeout-minutes: \d+/);
    }
    expect(source).not.toMatch(/contents: write|pull-requests: write|id-token/);
  });

  it('Dado os segredos, Quando procurados, Então só o job producao os usa, por env do passo, nunca em run', () => {
    expect(bloco('validar')).not.toContain('secrets.');
    expect(bloco('fumaca')).not.toContain('secrets.');
    const job = bloco('producao');
    const envDoJob = job.slice(
      job.indexOf('    env:'),
      job.indexOf('    steps:'),
    );
    expect(envDoJob).not.toContain('secrets.');
    for (const l of source.split('\n')) {
      if (l.trim().startsWith('run:')) expect(l).not.toContain('${{');
    }
    expect(semComentarios).not.toMatch(/set -x/);
    expect(semComentarios.match(/^\s+environment:/gm)).toHaveLength(1);
  });

  it('Dado o PAT, Quando procurado, Então não está no env do job nem no checkout e só o passo de publicar o usa com o helper do gh', () => {
    const job = bloco('producao');
    expect(job).toMatch(
      /actions\/checkout[^\n]*\n\s+with:[\s\S]*?persist-credentials: false/,
    );
    expect(job).not.toMatch(/token: \$\{\{ secrets/);
    expect(job).toMatch(
      /name: Publicar tag e Release[\s\S]*?GH_TOKEN: \$\{\{ secrets\.RELEASE_CUT_TOKEN \}\}[\s\S]*?gh auth setup-git\n\s+npm run release:publish/,
    );
    expect(source.match(/secrets\.RELEASE_CUT_TOKEN/g)).toHaveLength(2);
  });

  it('Dado o job de produção, Quando lido, Então exige o Environment producao, depende do validar e pula no dry_run', () => {
    const job = bloco('producao');
    expect(job).toContain('needs: validar');
    expect(job).toContain('environment: producao');
    expect(job).toContain('if: inputs.dry_run != true');
  });

  it('Dado o job de produção, Quando lido, Então a ordem é main sem avanço, backup, tag e deploy', () => {
    const job = bloco('producao');
    const ordem = [
      'Conferir que a main não avançou',
      'Backup no VPS',
      'Publicar tag e Release',
      'Deploy pela API do Coolify',
    ].map((nome) => job.indexOf(`name: ${nome}`));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem);
    expect(job).toMatch(/ESPERADO_SHA: \$\{\{ github\.sha \}\}/);
    expect(job).toContain('bash scripts/release/backup-vps.sh');
    expect(job).toContain('bash scripts/release/deploy-coolify.sh');
  });

  it('Dado o job validar, Quando lido, Então a validação do disparo é o primeiro passo, antes do checkout', () => {
    const lines = bloco('validar').split('\n');
    const primeiro = lines.findIndex((l) => l.includes('- name:'));
    expect(lines[primeiro]).toContain('Validar o disparo');
    expect(
      lines.findIndex((l) => l.includes('actions/checkout')),
    ).toBeGreaterThan(primeiro);
  });

  it('Dado que o job fumaca roda depois, Então depende de validar e producao e só não confere versão no dry_run', () => {
    expect(bloco('fumaca')).toContain('needs: [validar, producao]');
    expect(bloco('fumaca')).toMatch(
      /CONFERIR_VERSAO: \$\{\{ !inputs\.dry_run \}\}/,
    );
    expect(bloco('fumaca')).toContain("needs.producao.result == 'skipped'");
  });
});

describe('Feature: validação do disparo (ADR-092)', () => {
  const validar = passo('validar', 'Validar o disparo');

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

  it('Dado um segredo de produção vazio, Quando o passo roda, Então falha; com todos, passa', () => {
    const exigir = passo('producao', 'Exigir os segredos de produção');
    const todos = {
      VPS_SSH_KEY: 'x',
      VPS_KNOWN_HOSTS: 'x',
      VPS_HOST: 'x',
      COOLIFY_URL: 'x',
      COOLIFY_TOKEN: 'x',
      COOLIFY_APP_UUID: 'x',
      GH_TOKEN: 'x',
    };
    expect(codigo(exigir, todos)).toBe(0);
    for (const nome of Object.keys(todos)) {
      expect(codigo(exigir, { ...todos, [nome]: '' }), nome).toBe(1);
    }
  });
});

describe('Feature: a staging validou o SHA (#851)', () => {
  const conferir = passo('validar', 'Conferir que a staging validou');
  let bin: string;

  beforeEach(() => {
    bin = mkdtempSync(path.join(tmpdir(), 'gh-falso-'));
  });
  afterEach(() => rmSync(bin, { recursive: true, force: true }));

  /** `gh` falso: imprime a contagem de execuções verdes que a API devolveria. */
  function comVerdes(n: string): number {
    const gh = path.join(bin, 'gh');
    writeFileSync(gh, `#!/bin/sh\necho ${n}\n`);
    chmodSync(gh, 0o755);
    try {
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', conferir], {
        env: {
          ...process.env,
          PATH: `${bin}:/usr/bin:/bin`,
          GH_REPO: 'o/r',
          SHA: 'a'.repeat(40),
        },
        stdio: 'ignore',
      });
      return 0;
    } catch (error) {
      return (error as { status?: number }).status ?? 1;
    }
  }

  it('Dado uma execução verde da staging para o SHA, Então passa', () => {
    expect(comVerdes('1')).toBe(0);
  });

  it('Dado nenhuma execução verde da staging para o SHA, Então reprova', () => {
    expect(comVerdes('0')).toBe(1);
  });
});
