import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingsFor } from '../../scripts/gate/protect-tests-hook';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hook-'));
  mkdirSync(join(root, 'tests'));
  writeFileSync(join(root, 'tests', 'existente.test.ts'), "it('a', () => {});");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('Hook que impede o agente de enfraquecer teste', () => {
  it('ignora chamada sem caminho de arquivo', () => {
    expect(findingsFor('Edit', {}, root)).toEqual([]);
  });

  it('libera Write de teste novo e bloqueia reescrever teste existente', () => {
    expect(
      findingsFor(
        'Write',
        { file_path: 'tests/novo.test.ts', content: 'x' },
        root,
      ),
    ).toEqual([]);
    expect(
      findingsFor(
        'Write',
        { file_path: 'tests/existente.test.ts', content: 'x' },
        root,
      ),
    ).toMatchObject([{ rule: 'reescrita-integral-de-teste-existente' }]);
  });

  it('bloqueia Edit que troca asserção, aceitando caminho absoluto', () => {
    const file_path = join(root, 'tests', 'existente.test.ts');
    expect(
      findingsFor(
        'Edit',
        {
          file_path,
          old_string: 'expect(a).toBe(1)',
          new_string: 'expect(a).toBe(2)',
        },
        root,
      ),
    ).toMatchObject([{ rule: 'asserção-removida-ou-alterada' }]);
  });

  it('analisa cada edição de um MultiEdit', () => {
    const edits = [
      { old_string: '});', new_string: '});\nit("b", () => {});' },
      { old_string: 'expect(x)', new_string: 'expect(y)' },
    ];
    expect(
      findingsFor(
        'MultiEdit',
        { file_path: 'tests/existente.test.ts', edits },
        root,
      ),
    ).toHaveLength(1);
    expect(
      findingsFor('MultiEdit', { file_path: 'tests/existente.test.ts' }, root),
    ).toEqual([]);
  });
});
