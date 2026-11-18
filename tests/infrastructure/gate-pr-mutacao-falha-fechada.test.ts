import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #820: a mutação do PR falha fechada. Erro, saída vazia onde devia haver alvo e saída inesperada do
 * `impacto.ts --mutacao` reprovam o gate em vez de pular o job `mutacao` em silêncio.
 */
const root = path.resolve(import.meta.dirname, '../..');
const gate = readFileSync(
  path.join(root, '.github/workflows/gate-pr.yml'),
  'utf8',
);

function passo(marker: string): string {
  const lines = gate.split('\n');
  const start = lines.findIndex((line) => line.includes(marker));
  expect(start, marker).toBeGreaterThanOrEqual(0);
  const runAt = lines.findIndex(
    (line, index) => index > start && line.trim() === 'run: |',
  );
  const body = lines.slice(runAt + 1);
  const indent = body[0]?.match(/^ */)?.[0].length ?? 0;
  const script: string[] = [];
  for (const line of body) {
    if (line.trim().length > 0 && !line.startsWith(' '.repeat(indent))) break;
    script.push(line.trim().length === 0 ? '' : line.slice(indent));
  }
  return script.join('\n');
}

type Resultado = { codigo: number; saida: string; stderr: string };

/** Executa o passo `sel` com `npx` e `compat-migracao.sh` simulados; `mutacao` controla `--mutacao`. */
function rodarSel(mutacao: { saida?: string; erro?: boolean }): Resultado {
  const dir = mkdtempSync(path.join(tmpdir(), 'mut820-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(path.join(dir, 'scripts/release'), { recursive: true });
  writeFileSync(
    path.join(dir, 'scripts/release/compat-migracao.sh'),
    'echo precisa=false\n',
  );
  const npx = path.join(bin, 'npx');
  writeFileSync(
    npx,
    [
      '#!/bin/bash',
      'case "$*" in',
      '  *docs-only*) echo so_doc=false ;;',
      mutacao.erro
        ? '  *--mutacao*) echo "boom" >&2; exit 2 ;;'
        : `  *--mutacao*) printf '%s' '${mutacao.saida ?? ''}' ;;`,
      '  *) echo ALL ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(npx, 0o755);
  const out = path.join(dir, 'out');
  try {
    execFileSync('bash', ['-e', '-c', passo('id: sel')], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}:/usr/bin:/bin`,
        BASE_REF: 'origin/main',
        GATE_BASE: 'origin/main',
        ALVO: 'main',
        ORIGEM: 'feat/x',
        GITHUB_OUTPUT: out,
        GITHUB_STEP_SUMMARY: path.join(dir, 'sum'),
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { codigo: 0, saida: readFileSync(out, 'utf8'), stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return {
      codigo: e.status ?? 1,
      saida: '',
      stderr: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  }
}

function conferirMutacao(env: Record<string, string>): number {
  try {
    execFileSync(
      'bash',
      ['-e', '-o', 'pipefail', '-c', passo('name: Conferir')],
      {
        env: {
          ...process.env,
          PATH: '/usr/bin:/bin',
          R_POLITICA: 'success',
          COMPLETO: 'true',
          R_IMPACTO: 'success',
          SO_DOC: 'false',
          RODAR_E2E: 'false',
          R_INTEGRACAO: 'success',
          R_PROD: 'skipped',
          R_DEV: 'skipped',
          R_COMPAT: 'skipped',
          RODAR_COMPAT: 'false',
          ...env,
        },
        stdio: 'ignore',
      },
    );
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
}

describe('#820 mutação do PR falha fechada', () => {
  it('erro do impacto.ts --mutacao reprova o passo (não vira "nada a mutar")', () => {
    const r = rodarSel({ erro: true });
    expect(r.codigo).not.toBe(0);
    expect(r.stderr).toContain('mutação não pode ser decidida');
  });

  it('saída inesperada reprova o passo', () => {
    const r = rodarSel({ saida: 'Error: algo\nquebrou; rm -rf' });
    expect(r.codigo).not.toBe(0);
    expect(r.stderr).toContain('saída inesperada');
  });

  it('lista de alvos válida liga rodar_mutacao', () => {
    const r = rodarSel({ saida: 'src/domain/a.ts,src/application/b.ts' });
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('rodar_mutacao=true');
    expect(r.saida).toContain('mutacao=src/domain/a.ts,src/application/b.ts');
  });

  it('saída vazia legítima (nenhum arquivo de regra) dispensa o job', () => {
    const r = rodarSel({ saida: '' });
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('rodar_mutacao=false');
  });

  it('agregador: só o false exato dispensa a mutação', () => {
    expect(
      conferirMutacao({ RODAR_MUTACAO: 'false', R_MUTACAO: 'skipped' }),
    ).toBe(0);
    for (const rodar of ['', 'talvez', 'FALSE']) {
      expect(
        conferirMutacao({ RODAR_MUTACAO: rodar, R_MUTACAO: 'skipped' }),
        `RODAR_MUTACAO=${rodar}`,
      ).toBe(1);
    }
    expect(
      conferirMutacao({ RODAR_MUTACAO: 'true', R_MUTACAO: 'success' }),
    ).toBe(0);
    expect(
      conferirMutacao({ RODAR_MUTACAO: 'true', R_MUTACAO: 'skipped' }),
    ).toBe(1);
  });

  it('o job mutacao reprova sem alvo e sem relatório do Stryker', () => {
    const run = passo('name: Stryker (só os arquivos alterados)');
    expect(run).toContain('[ -n "$ALVOS" ]');
    expect(run).toContain('reports/mutation/mutation.json');
  });
});
