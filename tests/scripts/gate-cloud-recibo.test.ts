import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O recibo lista o que foi pulado com `grep '^pulado:'`. Sem nenhuma linha,
 * o grep sai 1 e o `pipefail` fazia o script sair 1 mesmo com todas as
 * etapas em rc 0 — e também trocava um rc real (7) por 1. Estes casos
 * chamam as funções do script (`com_recibo`, `step`, `skip`).
 */
const SCRIPT = join(process.cwd(), 'scripts', 'gate-cloud.sh');

type Modo = 'nada' | 'pulado' | 'falha';

interface Resultado {
  status: number;
  recibo: string;
}

function bashSingle(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function driver(modo: Modo, times: string, recibo: string): string {
  return [
    'set -euo pipefail',
    `source ${bashSingle(SCRIPT)}`,
    `TIMES=${bashSingle(times)}`,
    `RECIBO=${bashSingle(recibo)}`,
    `modo=${bashSingle(modo)}`,
    'cenario() {',
    '  case "$modo" in',
    '    nada) step ok true ;;',
    '    pulado)',
    '      step ok true',
    '      skip e2e "mapa de teste"',
    '      ;;',
    '    falha) step ruim bash -c "exit 7" ;;',
    '  esac',
    '}',
    'com_recibo teste cenario',
  ].join('\n');
}

function run(modo: Modo): Resultado {
  const dir = mkdtempSync(join(tmpdir(), 'gate-cloud-recibo-'));
  const times = join(dir, 'times.txt');
  const reciboPath = join(dir, 'recibo.md');
  let status = 0;
  let stdout = '';
  try {
    stdout = execFileSync('bash', ['-c', driver(modo, times, reciboPath)], {
      encoding: 'utf8',
    });
  } catch (error) {
    const err = error as {
      status: number | null;
      stdout?: string;
    };
    status = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  let recibo = '';
  try {
    recibo = readFileSync(reciboPath, 'utf8');
  } catch {
    recibo = stdout;
  }
  rmSync(dir, { recursive: true, force: true });
  return { status, recibo };
}

describe('Feature: recibo do gate nuvem não decide o exit code', () => {
  it('Dado nenhuma etapa pulada, Quando o perfil termina em 0, Então o script sai 0', () => {
    const resultado = run('nada');

    expect(resultado.status).toBe(0);
    expect(resultado.recibo).toContain('perfil=teste rc=0');
    expect(resultado.recibo).toContain('| ok | 0 |');
    expect(resultado.recibo).not.toContain('pulado:');
  });

  it('Dado uma etapa pulada, Quando o perfil termina, Então sai 0 e o recibo lista a etapa', () => {
    const resultado = run('pulado');

    expect(resultado.status).toBe(0);
    expect(resultado.recibo).toContain('- pulado: e2e (mapa de teste)');
  });

  it('Dado uma etapa que sai 7, Quando o recibo imprime, Então o script sai 7', () => {
    const resultado = run('falha');

    expect(resultado.status).toBe(7);
    expect(resultado.recibo).toContain('perfil=teste rc=7');
    expect(resultado.recibo).toContain('| ruim | 7 |');
  });
});
