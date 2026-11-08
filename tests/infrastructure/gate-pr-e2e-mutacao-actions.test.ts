import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-098: o E2E e a mutação por arquivo alterado são checks obrigatórios do PR no Actions
 * (agregador "Gate do PR"), também contra a `main`, e o recibo `E2E-GATE:` deixou de ser exigido.
 */
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string =>
  readFileSync(path.join(root, file), 'utf8');

const gate = read('.github/workflows/gate-pr.yml');
const recibo = read('.github/workflows/recibo-gate.yml');

function bloco(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

/** Corpo do `run: |` do passo Conferir do agregador. */
function conferir(): string {
  const lines = bloco(gate, 'gate-pr').split('\n');
  const start = lines.findIndex((l) => l.includes('name: Conferir'));
  const runAt = lines.findIndex((l, i) => i > start && l.trim() === 'run: |');
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
      env: { ...env, PATH: '/usr/bin:/bin' },
      stdio: 'ignore',
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

const BASE = {
  R_POLITICA: 'success',
  COMPLETO: 'true',
  R_IMPACTO: 'success',
  SO_DOC: 'false',
  RODAR_E2E: 'true',
  R_INTEGRACAO: 'success',
  R_PROD: 'success',
  R_DEV: 'success',
  RODAR_MUTACAO: 'true',
  R_MUTACAO: 'success',
};

describe('Feature: E2E e mutação como check obrigatório do PR no Actions (ADR-098)', () => {
  it('Dado um PR contra a main, Quando o gate dispara, Então o E2E também roda (release/* e hotfix/*)', () => {
    expect(gate).toMatch(
      /pull_request:\n\s+branches: \["release\/\*\*", main\]/,
    );
  });

  it('Dado o job de mutação, Quando o Stryker roda, Então muta só os arquivos alterados, recebidos por variável de ambiente', () => {
    const job = bloco(gate, 'mutacao');
    expect(job).toContain('needs: impacto');
    expect(job).toContain("needs.impacto.outputs.rodar_mutacao == 'true'");
    expect(job).toContain(
      'npm run test:mutacao -- --incremental --mutate "$ALVOS"',
    );
    expect(job).toContain('ALVOS: ${{ needs.impacto.outputs.mutacao }}');
    expect(job).not.toMatch(/run:.*\$\{\{/);
  });

  it('Dado o PR contra a main, Quando o impacto é calculado, Então a mutação da release inteira não se repete', () => {
    expect(gate).toContain('[ "$ALVO" != main ]');
  });

  it('Dado a mutação que devia rodar e falhou, Quando o agregador confere, Então o Gate do PR reprova', () => {
    expect(codigo(BASE)).toBe(0);
    expect(codigo({ ...BASE, R_MUTACAO: 'failure' })).toBe(1);
    expect(codigo({ ...BASE, R_MUTACAO: 'skipped' })).toBe(1);
  });

  it('Dado nenhum arquivo de regra alterado, Quando a mutação é pulada, Então o Gate do PR passa; rodar sem devia pular reprova', () => {
    const pulada = { ...BASE, RODAR_MUTACAO: 'false', R_MUTACAO: 'skipped' };
    expect(codigo(pulada)).toBe(0);
    expect(codigo({ ...pulada, R_MUTACAO: 'success' })).toBe(1);
  });

  it('Dado um E2E vermelho, Quando o agregador confere, Então o Gate do PR reprova mesmo com a mutação verde', () => {
    expect(codigo({ ...BASE, R_PROD: 'failure' })).toBe(1);
    expect(codigo({ ...BASE, R_DEV: 'failure' })).toBe(1);
  });
});

describe('Feature: o recibo do gate local deixou de ser exigido no PR (ADR-098)', () => {
  it('Dado o workflow de integridade, Quando o PR abre, Então não confere mais a linha E2E-GATE', () => {
    expect(recibo).not.toContain('verify-receipt');
    expect(recibo).not.toMatch(/run:.*E2E-GATE/);
    expect(recibo).toContain('scripts/gate/check-test-integrity.ts');
    expect(recibo).toContain('scripts/release/check-homologacao.ts');
  });

  it('Dado o template do PR, Quando alguém o preenche, Então não pede o recibo', () => {
    expect(read('.github/pull_request_template.md')).not.toContain('E2E-GATE');
  });
});
