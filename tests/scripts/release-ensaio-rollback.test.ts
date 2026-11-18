import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #925 (ADR-113): o rollback automático do Release deploy é provado a cada `dry_run` pelo job `validar`
 * (`ensaio-rollback.sh`). Aqui: o passo existe, não usa segredo, e o ensaio roda de ponta a ponta.
 */
const root = path.resolve(import.meta.dirname, '../..');
const workflow = readFileSync(
  path.join(root, '.github/workflows/release-deploy.yml'),
  'utf8',
);

function bloco(name: string): string {
  const lines = workflow.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

describe('Feature: ensaio do rollback automático (#925)', () => {
  it('Dado o job validar, Então ensaia o rollback sem segredo e antes da aprovação, em dry_run e publicação', () => {
    const validar = bloco('validar');
    expect(validar).toContain('name: Ensaiar o rollback automático');
    expect(validar).toContain('bash scripts/release/ensaio-rollback.sh');
    expect(validar).not.toContain('secrets.');
    expect(validar).not.toContain('inputs.dry_run');
    expect(bloco('producao')).not.toContain('ensaio-rollback.sh');
  });

  const temFerramentas = ['curl', 'jq', 'openssl'].every(
    (b) => spawnSync('which', [b]).status === 0,
  );
  it.skipIf(!temFerramentas)(
    'Dado o simulador do Coolify, Quando a fumaça reprova de propósito, Então a imagem volta, o recurso volta a HEAD e o ensaio termina verde',
    () => {
      const r = spawnSync(
        'bash',
        [path.join(root, 'scripts/release/ensaio-rollback.sh')],
        { encoding: 'utf8', env: { ...process.env } },
      );
      const saida = `${r.stdout}${r.stderr}`;
      expect(saida).toContain('Ensaio do rollback ok');
      expect(saida).toContain('ROLLBACK AUTOMÁTICO EXECUTADO');
      expect(saida).toContain('o recurso NÃO fica preso no SHA antigo');
      expect(r.status).toBe(0);
    },
    120_000,
  );
});
