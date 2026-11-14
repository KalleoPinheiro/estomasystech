import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-098 / fase 2c: `portao-risco` é o check do ruleset; na classe 3 exige a aprovação do dono pelo
 * Environment `aprovacao-classe-3`, que um agente não consegue clicar.
 */
const root = path.resolve(import.meta.dirname, '../..');
const source = readFileSync(
  path.join(root, '.github/workflows/portao-risco.yml'),
  'utf8',
);

function bloco(name: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

function conferir(): string {
  const lines = bloco('portao-risco').split('\n');
  const runAt = lines.findIndex((l) => l.trim() === 'run: |');
  const body = lines.slice(runAt + 1);
  const indent = body[0]?.match(/^ */)?.[0].length ?? 0;
  const out: string[] = [];
  for (const l of body) {
    if (l.trim() && !l.startsWith(' '.repeat(indent))) break;
    out.push(l.slice(indent));
  }
  return out.join('\n');
}

function codigo(env: Record<string, string>): number {
  try {
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', conferir()], {
      env: { ...env, PATH: '/usr/bin:/bin', NODE_ENV: 'test' },
      stdio: 'ignore',
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

const PR = {
  EVENTO: 'pull_request',
  DRAFT: 'false',
  R_RISCO: 'success',
  HUMANA: 'false',
  R_APROVACAO: 'skipped',
};

describe('Feature: portão de risco com aprovação do dono na classe 3', () => {
  it('Dado a classe 3, Quando o job de aprovação roda, Então usa o Environment protegido e só na classe 3', () => {
    const job = bloco('aprovacao-classe-3');
    expect(job).toContain('environment: aprovacao-classe-3');
    expect(job).toContain("needs.risco.outputs.humana == 'true'");
  });

  it('Dado o workflow, Quando dispara, Então não usa pull_request_target nem segredo', () => {
    expect(source).not.toMatch(/^\s+pull_request_target:/m);
    expect(source).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it('Dado classe 0 a 2, Quando a aprovação é pulada, Então o portão passa', () => {
    expect(codigo(PR)).toBe(0);
  });

  it('Dado a classe 3 sem aprovação (pendente, negada ou pulada), Então o portão reprova', () => {
    const c3 = { ...PR, HUMANA: 'true' };
    expect(codigo({ ...c3, R_APROVACAO: 'success' })).toBe(0);
    for (const r of ['skipped', 'failure', 'cancelled']) {
      expect(codigo({ ...c3, R_APROVACAO: r }), r).toBe(1);
    }
  });

  it('Dado a classificação que falhou, Quando o portão confere, Então reprova', () => {
    expect(codigo({ ...PR, R_RISCO: 'failure' })).toBe(1);
    expect(codigo({ ...PR, R_RISCO: 'skipped' })).toBe(1);
  });

  it('Dado rascunho, Então reprova (ADR-093); na fila de merge, passa', () => {
    expect(codigo({ ...PR, DRAFT: 'true', R_RISCO: 'skipped' })).toBe(1);
    expect(codigo({ ...PR, EVENTO: 'merge_group', R_RISCO: 'skipped' })).toBe(
      0,
    );
  });

  it('Dado o portão, Quando classifica, Então o checkout e o script são os da base e o head é só SHA', () => {
    const job = bloco('risco');
    expect(source).not.toMatch(/pull_request_target/);
    expect(source).not.toMatch(/\$\{\{\s*secrets\./);
    expect(source).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(job).toContain('github.event.pull_request.base.sha');
    expect(job).toContain('persist-credentials: false');
    expect(job).toContain('--base');
    expect(job).toContain('--head');
    expect(job).toMatch(/refs\/pull\/\$\{PR_NUMBER\}\/head/);
    expect(job).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.pull_request\.head/,
    );
    expect(job.match(/npm ci --ignore-scripts/g)).toHaveLength(1);
  });
});
