import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// O Actions roda estes arquivos com `npx tsx`, como CJS (o pacote não é `type: module`): `await` no topo
// do arquivo derruba o job com TransformError antes de qualquer lógica (visto no primeiro run real do #764).
describe('Feature: scripts de release carregam sob o tsx do Actions', () => {
  it.each(['julgar-pr.ts', 'conferir-release.ts'])(
    'Dado %s sem argumentos, Quando o tsx o carrega, Então chega à validação de entrada e não a um erro de transformação',
    (arquivo) => {
      const r = spawnSync('npx', ['tsx', `scripts/release/${arquivo}`], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      });
      expect(`${r.stdout}${r.stderr}`).not.toMatch(
        /TransformError|Top-level await/,
      );
      expect(r.status).toBe(1);
    },
    60_000,
  );
});
