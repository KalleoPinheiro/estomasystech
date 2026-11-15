import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve('scripts/release/compat-migracao.sh');
const gate = readFileSync('.github/workflows/gate-pr.yml', 'utf8');
const dirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Repositório com um commit-base; `arquivos` entram num segundo commit (o HEAD do PR). */
function repo(arquivos: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'compat-'));
  dirs.push(dir);
  git(dir, 'init', '-q', '-b', 'base');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  mkdirSync(path.join(dir, 'drizzle'));
  writeFileSync(
    path.join(dir, 'drizzle/0001_a.sql'),
    'CREATE TABLE a (id int);',
  );
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'base');
  git(dir, 'switch', '-qc', 'pr');
  for (const [arquivo, conteudo] of Object.entries(arquivos)) {
    mkdirSync(path.dirname(path.join(dir, arquivo)), { recursive: true });
    writeFileSync(path.join(dir, arquivo), conteudo);
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-qm', 'pr', '--allow-empty');
  return dir;
}

function rodar(cwd: string, ...args: string[]) {
  return spawnSync('bash', [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, INTEGRATION_DATABASE_URL: '' },
  });
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('compat-migracao · quando o job roda', () => {
  it('Dado um diff que adiciona drizzle/*.sql, Quando decide, Então precisa=true', () => {
    const dir = repo({
      'drizzle/0002_b.sql': 'ALTER TABLE a ADD COLUMN b int;',
    });
    expect(rodar(dir, 'precisa', 'base').stdout.trim()).toBe('precisa=true');
  });

  it('Dado um diff que só toca código e o journal, Quando decide, Então precisa=false', () => {
    const dir = repo({
      'src/x.ts': 'export {};',
      'drizzle/meta/_journal.json': '{}',
    });
    expect(rodar(dir, 'precisa', 'base').stdout.trim()).toBe('precisa=false');
  });

  it('Dado um diff sem arquivos, Quando decide, Então precisa=false', () => {
    const dir = repo({});
    expect(rodar(dir, 'precisa', 'base').stdout.trim()).toBe('precisa=false');
  });
});

describe('compat-migracao · uso', () => {
  it('Dado modo ou base ausente ou modo desconhecido, Quando roda, Então sai com 2', () => {
    const dir = repo({});
    expect(rodar(dir).status).toBe(2);
    expect(rodar(dir, 'precisa').status).toBe(2);
    expect(rodar(dir, 'xyz', 'base').status).toBe(2);
  });

  it('Dado o modo rodar sem Postgres informado, Quando roda, Então reprova antes de montar a base', () => {
    const dir = repo({
      'drizzle/0002_b.sql': 'ALTER TABLE a ADD COLUMN b int;',
    });
    const r = rodar(dir, 'rodar', 'base');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('INTEGRATION_DATABASE_URL');
  });
});

describe('gate-pr.yml · job compat-migracao', () => {
  it('Dado o gate, Quando o diff não toca drizzle/*.sql, Então o job só roda com rodar_compat=true e o agregador exige o resultado', () => {
    expect(gate).toContain("needs.impacto.outputs.rodar_compat != 'false'");
    expect(gate).toContain(
      'bash scripts/release/compat-migracao.sh rodar "$GATE_BASE"',
    );
    expect(gate).toContain(`conferir compat-migracao "\${R_COMPAT:-skipped}"`);
    expect(gate).toMatch(/needs: \[[^\]]*compat-migracao/);
  });

  it('Dado o job, Quando sobe o Postgres, Então é a versão 18 e a base é a do PR (ou a da fila)', () => {
    const ini = gate.indexOf('\n  compat-migracao:');
    const fim = gate.indexOf('\n  build-prod:');
    const bloco = gate.slice(ini, fim);
    expect(bloco).toContain('image: postgres:18');
    expect(bloco).toContain('merge_group.base_sha');
    expect(bloco).toContain('fetch-depth: 0');
  });

  it('Dado o passo sel, Quando o script precisa falha ou devolve lixo, Então rodar_compat cai em true (falha fechada)', () => {
    expect(gate).not.toMatch(/compat-migracao\.sh precisa[^\n]*\|\s*cut/);
    const bloco = gate.slice(gate.indexOf('Falha fechada: erro do script'));
    const linhas = bloco
      .split('\n')
      .slice(1, 3)
      .map((l) => l.trim());
    for (const [saida, falha, esperado] of [
      ['precisa=false', false, 'false'],
      ['precisa=true', false, 'true'],
      ['', true, 'true'],
      ['lixo', false, 'true'],
    ] as const) {
      const script = [
        `saida_fake='${saida}'`,
        `fake() { ${falha ? 'return 1' : 'echo "$saida_fake"'}; }`,
        linhas[0].replace(
          /bash scripts\/release\/compat-migracao\.sh precisa "\$BASE_REF"/,
          'fake',
        ),
        linhas[1],
        'echo "$rodar_compat"',
      ].join('\n');
      const r = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
      expect(r.stdout.trim(), `${saida}/${falha}`).toBe(esperado);
    }
  });

  it('Dado uma base inexistente, Quando decide, Então sai com 1 e não imprime precisa=false', () => {
    const dir = repo({
      'drizzle/0002_b.sql': 'ALTER TABLE a ADD COLUMN b int;',
    });
    const r = rodar(dir, 'precisa', 'origin/nao-existe');
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('precisa=false');
  });

  it('Dado o agregador, Quando rodar_compat é vazio ou lixo e o job foi pulado, Então reprova; só o false exato aceita skipped', () => {
    const linhas = gate.split('\n');
    const ini = linhas.findIndex((l) => l.includes('name: Conferir'));
    const run = linhas.findIndex((l, n) => n > ini && l.trim() === 'run: |');
    const corpo: string[] = [];
    for (const l of linhas.slice(run + 1)) {
      if (l.trim() !== '' && !l.startsWith(' '.repeat(10))) break;
      corpo.push(l.slice(10));
    }
    const base = {
      R_POLITICA: 'success',
      COMPLETO: 'true',
      R_IMPACTO: 'success',
      SO_DOC: 'false',
      RODAR_E2E: 'false',
      R_INTEGRACAO: 'success',
      R_PROD: 'skipped',
      R_DEV: 'skipped',
    };
    const codigo = (rodar: string, resultado: string): number | null =>
      spawnSync('bash', ['-e', '-o', 'pipefail', '-c', corpo.join('\n')], {
        env: {
          ...process.env,
          PATH: '/usr/bin:/bin',
          ...base,
          RODAR_COMPAT: rodar,
          R_COMPAT: resultado,
        },
        encoding: 'utf8',
      }).status;
    expect(codigo('false', 'skipped')).toBe(0);
    expect(codigo('true', 'success')).toBe(0);
    expect(codigo('true', 'skipped')).toBe(1);
    expect(codigo('true', 'failure')).toBe(1);
    expect(codigo('', 'skipped')).toBe(1);
    expect(codigo('lixo', 'skipped')).toBe(1);
    expect(codigo('false', 'success')).toBe(1);
  });
});
