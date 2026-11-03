import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ADR-093: o pipeline pesado do Actions só roda com o PR pronto. Em rascunho o
 * agregador "Gate do PR" e o job `ci` reprovam de propósito. A matriz executa o
 * `run:` do passo Conferir com bash, no mesmo formato do POC (0 divergências).
 */
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string): string =>
  readFileSync(path.join(root, file), 'utf8');

const FRASE_GATE =
  'PR em rascunho: o gate completo roda quando o PR for marcado como pronto (ADR-093)';
const FRASE_CI =
  'PR em rascunho: o CI completo roda quando o PR for marcado como pronto (ADR-093)';

const TIMEOUTS: Record<string, Record<string, number>> = {
  '.github/workflows/gate-pr.yml': {
    politica: 5,
    impacto: 10,
    integracao: 20,
    'e2e-prod': 20,
    'e2e-dev': 20,
    'gate-pr': 5,
  },
  '.github/workflows/ci.yml': {
    escopo: 10,
    estatico: 10,
    'server-first-provado': 10,
    'cobertura-shard': 15,
    cobertura: 15,
    ci: 15,
  },
  '.github/workflows/recibo-gate.yml': { 'recibo-gate': 10 },
  '.github/workflows/mutacao-mensal.yml': { 'ultimo-dia': 5, mutacao: 120 },
};

const SLIM = new Set([
  'politica',
  'gate-pr',
  'escopo',
  'impacto',
  'recibo-gate',
]);
const ESTADOS = ['success', 'failure', 'cancelled', 'skipped'] as const;

type Env = Record<string, string>;

function job(name: string, source: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

function jobNames(source: string): string[] {
  const lines = source.split('\n');
  const jobsAt = lines.indexOf('jobs:');
  return lines
    .slice(jobsAt + 1)
    .filter((line) => /^ {2}[a-z0-9-]+:$/.test(line))
    .map((line) => line.trim().slice(0, -1));
}

function pullRequest(source: string): string {
  const lines = source.split('\n');
  const start = lines.indexOf('  pull_request:');
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

function conferir(source: string): string {
  const lines = job('gate-pr', source).split('\n');
  const start = lines.findIndex((line) => line.includes('name: Conferir'));
  const runAt = lines.findIndex(
    (line, index) => index > start && line.trim() === 'run: |',
  );
  expect(runAt).toBeGreaterThanOrEqual(0);
  const body = lines.slice(runAt + 1);
  const indent = body[0]?.match(/^ */)?.[0].length ?? 0;
  const script: string[] = [];
  for (const line of body) {
    if (line.trim().length === 0) {
      script.push('');
      continue;
    }
    if (!line.startsWith(' '.repeat(indent))) break;
    script.push(line.slice(indent));
  }
  return script.join('\n');
}

function bate(resultado: string | undefined, rodar: boolean): boolean {
  return rodar ? resultado === 'success' : resultado === 'skipped';
}

function timeoutOf(block: string): number | null {
  const match = block.match(/timeout-minutes:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function runsOn(block: string): string {
  return block.match(/runs-on:\s*(\S+)/)?.[1] ?? '';
}

/** Regra do ADR-093, independente do bash: o que devia rodar é success; o resto é skipped. */
function esperado(env: Env): number {
  if (env.R_POLITICA !== 'success') return 1;
  if (env.COMPLETO !== 'true') return 1;
  if (env.R_IMPACTO !== 'success') return 1;
  if (!bate(env.R_INTEGRACAO, env.SO_DOC !== 'true')) return 1;
  if (!bate(env.R_PROD, env.RODAR_E2E === 'true')) return 1;
  if (!bate(env.R_DEV, env.RODAR_E2E === 'true')) return 1;
  return 0;
}

function executar(script: string, env: Env): number {
  try {
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      env: { ...env, PATH: '/usr/bin:/bin', NODE_ENV: 'test' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : 1;
  }
}

function matriz(): Array<{ nome: string; env: Env; esperado: number }> {
  const casos: Array<{ nome: string; env: Env; esperado: number }> = [];
  const pronto: Env = {
    R_POLITICA: 'success',
    COMPLETO: 'true',
    R_IMPACTO: 'success',
    SO_DOC: 'false',
    RODAR_E2E: 'true',
    R_INTEGRACAO: 'success',
    R_PROD: 'success',
    R_DEV: 'success',
  };
  const pulado: Env = {
    R_POLITICA: 'success',
    COMPLETO: 'false',
    R_IMPACTO: 'skipped',
    SO_DOC: '',
    RODAR_E2E: '',
    R_INTEGRACAO: 'skipped',
    R_PROD: 'skipped',
    R_DEV: 'skipped',
  };
  casos.push({ nome: 'rascunho, tudo pulado', env: pulado, esperado: 1 });
  casos.push({
    nome: 'rascunho com pesados em success',
    env: { ...pronto, COMPLETO: 'false' },
    esperado: 1,
  });
  for (const politica of ['failure', 'cancelled', 'skipped'] as const) {
    casos.push({
      nome: `politica ${politica}`,
      env: { ...pulado, R_POLITICA: politica, COMPLETO: '' },
      esperado: 1,
    });
  }
  for (const integracao of ESTADOS) {
    for (const prod of ESTADOS) {
      for (const dev of ESTADOS) {
        const env = {
          ...pronto,
          R_INTEGRACAO: integracao,
          R_PROD: prod,
          R_DEV: dev,
        };
        casos.push({
          nome: `pronto i=${integracao} p=${prod} d=${dev}`,
          env,
          esperado: esperado(env),
        });
      }
    }
  }
  const soDoc: Env = {
    ...pronto,
    SO_DOC: 'true',
    RODAR_E2E: 'false',
    R_INTEGRACAO: 'skipped',
    R_PROD: 'skipped',
    R_DEV: 'skipped',
  };
  casos.push({ nome: 'pronto so_doc, tudo pulado', env: soDoc, esperado: 0 });
  casos.push({
    nome: 'pronto so_doc mas integracao rodou',
    env: { ...soDoc, R_INTEGRACAO: 'success' },
    esperado: 1,
  });
  casos.push({
    nome: 'pronto, impacto falhou',
    env: {
      ...pronto,
      R_IMPACTO: 'failure',
      R_INTEGRACAO: 'skipped',
      R_PROD: 'skipped',
      R_DEV: 'skipped',
    },
    esperado: 1,
  });
  casos.push({
    nome: 'pronto, sem e2e',
    env: {
      ...pronto,
      RODAR_E2E: 'false',
      R_INTEGRACAO: 'success',
      R_PROD: 'skipped',
      R_DEV: 'skipped',
    },
    esperado: 0,
  });
  casos.push({
    nome: 'pronto, sem e2e mas prod rodou',
    env: {
      ...pronto,
      RODAR_E2E: 'false',
      R_INTEGRACAO: 'success',
      R_PROD: 'success',
      R_DEV: 'skipped',
    },
    esperado: 1,
  });
  return casos;
}

describe('Gate do PR só quando está pronto (ADR-093)', () => {
  const gate = read('.github/workflows/gate-pr.yml');
  const ci = read('.github/workflows/ci.yml');

  it('C1 gatilho ready_for_review sem labeled, edited ou paths', () => {
    for (const source of [gate, ci]) {
      const bloco = pullRequest(source);
      expect(bloco).toContain('ready_for_review');
      expect(bloco).not.toContain('labeled');
      expect(bloco).not.toContain('edited');
      expect(bloco).not.toContain('paths:');
      expect(bloco).toContain('opened');
      expect(bloco).toContain('synchronize');
      expect(bloco).toContain('reopened');
    }
  });

  it('C2 todo job de ci, gate, recibo e mutação mensal tem o timeout da tabela', () => {
    for (const [file, expected] of Object.entries(TIMEOUTS)) {
      const source = read(file);
      expect(jobNames(source), file).toEqual(Object.keys(expected));
      for (const name of Object.keys(expected)) {
        expect(timeoutOf(job(name, source)), `${file} ${name}`).toBe(
          expected[name],
        );
      }
    }
  });

  it('C3 ubuntu-slim só nos jobs leves, sem services nem build', () => {
    const files = Object.keys(TIMEOUTS).map(read).join('\n');
    for (const file of Object.keys(TIMEOUTS)) {
      const source = read(file);
      for (const name of jobNames(source)) {
        const block = job(name, source);
        const slim = runsOn(block) === 'ubuntu-slim';
        expect(slim, name).toBe(SLIM.has(name));
        if (!slim) continue;
        expect(block, name).not.toMatch(/services:/);
        expect(block, name).not.toMatch(/npm run build/);
      }
    }
    expect(files).toContain('ubuntu-slim');
  });

  it('C4 politica publica completo e o agregador reprova rascunho', () => {
    const politica = job('politica', gate);
    expect(runsOn(politica)).toBe('ubuntu-slim');
    expect(timeoutOf(politica)).toBe(5);
    expect(politica).toContain('completo:');
    expect(politica).not.toMatch(/uses:\s*actions\/checkout/);
    const agregador = job('gate-pr', gate);
    expect(agregador).toContain('name: Gate do PR');
    expect(agregador).toMatch(/if:\s*always\(\)/);
    expect(agregador).toContain('politica');
    expect(agregador).toContain(FRASE_GATE);
    const codigo = executar(conferir(gate), {
      R_POLITICA: 'success',
      COMPLETO: 'false',
      R_IMPACTO: 'skipped',
      SO_DOC: '',
      RODAR_E2E: '',
      R_INTEGRACAO: 'skipped',
      R_PROD: 'skipped',
      R_DEV: 'skipped',
    });
    expect(codigo).toBe(1);
  });

  it('C5 matriz do Conferir executada no bash tem 0 divergências', () => {
    const script = conferir(gate);
    const casos = matriz();
    const ruins = casos.filter(
      (caso) => (executar(script, caso.env) === 0) !== (caso.esperado === 0),
    );
    expect(casos).toHaveLength(2 + 3 + 4 * 4 * 4 + 5);
    expect(ruins.map((caso) => caso.nome)).toEqual([]);
  });

  it('C6 em rascunho o ci reprova no primeiro passo e o estático não roda', () => {
    const escopo = job('escopo', ci);
    const bloco = job('ci', ci);
    const frase = bloco.indexOf(FRASE_CI);
    expect(runsOn(escopo)).toBe('ubuntu-slim');
    expect(escopo).toContain('completo=');
    expect(runsOn(bloco)).toBe('ubuntu-24.04');
    expect(frase).toBeGreaterThanOrEqual(0);
    expect(frase).toBeLessThan(bloco.indexOf('run: npm run build'));
    expect(bloco.indexOf('run:')).toBeLessThan(frase);
    expect(job('estatico', ci)).toContain(
      "needs.escopo.outputs.completo == 'true'",
    );
    expect(job('cobertura-shard', ci)).toContain(
      "needs.escopo.outputs.pesado == 'true'",
    );
    expect(job('server-first-provado', ci)).toContain(
      "needs.escopo.outputs.completo == 'true'",
    );
  });

  it('C7 mutação sai do PR e fica no workflow_dispatch mensal', () => {
    expect(jobNames(gate)).not.toContain('mutacao');
    expect(gate).not.toContain('test:mutacao');
    expect(read('.github/workflows/mutacao-mensal.yml')).toContain(
      'workflow_dispatch:',
    );
  });

  it('C8 ADR-093 e a regra de rascunho no AGENTS.md', () => {
    const adr = read(
      'docs/adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md',
    );
    const agents = read('AGENTS.md');
    expect(adr).toContain('title: "ADR 093');
    expect(adr).toContain('status: frozen');
    expect(agents).toContain('release/**');
    expect(agents).toContain('nasce em rascunho');
    expect(agents).toContain('marcado pronto uma vez');
    expect(agents).toContain(
      '"Gate do PR" e `ci` ficam vermelhos de propósito',
    );
  });
});
