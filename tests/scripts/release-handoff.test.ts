import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  agregarHandoffs,
  hasHandoffFile,
  issueDoArquivo,
  requiresHandoff,
  touchedFrozen,
} from '../../scripts/release/handoff-lib';

describe('handoff por issue (ADR-102)', () => {
  it('Dado PR que toca código, pipeline ou release, Quando classifica, Então exige o handoff', () => {
    for (const f of [
      'src/lib/dto.ts',
      'drizzle/0001.sql',
      'Dockerfile',
      '.github/workflows/ci.yml',
      'scripts/release/lib.ts',
    ])
      expect(requiresHandoff(['docs/x.md', f]), f).toBe(true);
  });

  it('Dado PR só de documentação ou testes, Quando classifica, Então não exige o handoff', () => {
    expect(requiresHandoff(['docs/x.md', 'AGENTS.md'])).toBe(false);
    expect(requiresHandoff(['tests/scripts/x.test.ts'])).toBe(false);
    expect(requiresHandoff([])).toBe(false);
  });

  it('Dado arquivo adicionado, Quando procura o handoff, Então só vale <issue>-<slug>.md em handoff/', () => {
    expect(
      hasHandoffFile(['.specs/archive/handoff/799-handoff-por-issue.md']),
    ).toBe(true);
    for (const f of [
      '.specs/archive/handoff-2026.md',
      '.specs/archive/handoff/leia.md',
      '.specs/archive/handoff/799-x.txt',
      '.specs/archive/handoff/sub/799-x.md',
      '.specs/archive/outro/799-x.md',
    ])
      expect(hasHandoffFile([f]), f).toBe(false);
    expect(hasHandoffFile([])).toBe(false);
  });

  it('Dado edição do histórico congelado, Quando confere, Então detecta', () => {
    expect(touchedFrozen(['.specs/archive/handoff-2026.md'])).toBe(true);
    expect(touchedFrozen(['.specs/archive/handoff/1-a.md'])).toBe(false);
  });

  it('Dado vários handoffs, Quando agrega, Então vêm depois do congelado, por número de issue, e o fora do padrão sai', () => {
    const saida = agregarHandoffs('# congelado\n', [
      { caminho: '.specs/archive/handoff/10-b.md', conteudo: 'B\n' },
      { caminho: '.specs/archive/handoff/2-a.md', conteudo: 'A\n' },
      { caminho: '.specs/archive/handoff/leia.md', conteudo: 'ignorado\n' },
    ]);
    expect(saida).toBe('# congelado\n\nA\n\nB\n');
    expect(issueDoArquivo('.specs/archive/handoff/10-b.md')).toBe(10);
    expect(issueDoArquivo('x.md')).toBeNull();
  });

  it('Dado histórico vazio e nenhum handoff, Quando agrega, Então devolve só uma quebra de linha', () => {
    expect(agregarHandoffs('', [])).toBe('\n');
  });

  it('Dado o check sob o tsx (CJS), Quando carrega, Então não há erro de transformação', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/release/check-handoff.ts'], {
      encoding: 'utf8',
      env: { ...process.env, CHANGESET_BASE: 'HEAD' },
    });
    expect(`${r.stdout}${r.stderr}`).not.toMatch(
      /TransformError|Top-level await/,
    );
    expect(r.status).toBe(0);
  });
});
