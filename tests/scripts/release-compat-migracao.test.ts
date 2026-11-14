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
    expect(gate).toContain("needs.impacto.outputs.rodar_compat == 'true'");
    expect(gate).toContain(
      'bash scripts/release/compat-migracao.sh rodar "$GATE_BASE"',
    );
    expect(gate).toMatch(
      /conferir compat-migracao "\$\{R_COMPAT:-skipped\}" "\$\{RODAR_COMPAT:-false\}"/,
    );
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
});
