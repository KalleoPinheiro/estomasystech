import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #202: `console.error(…, error)` cru grava o `DrizzleQueryError` com os
 * parâmetros SQL (dado pessoal/saúde). Todo log de erro passa por
 * `src/lib/log-error.ts`, que remove query/params/detail.
 */
const SRC_ROOT = path.join(process.cwd(), 'src');
const HELPER = path.join(SRC_ROOT, 'lib', 'log-error.ts');
/** `console.error(`, `console['error']` e desestruturação `{ error } = console`. */
const FORBIDDEN =
  /console\s*\.\s*error\b|console\s*\[\s*['"`]error['"`]\s*\]|\{[^}]*\berror\b[^}]*\}\s*=\s*console\b/;

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('Arquitetura: log de erro centralizado (#202)', () => {
  it('C16 console.error só no helper de log', () => {
    const offenders = collectSourceFiles(SRC_ROOT)
      .filter((file) => file !== HELPER)
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
