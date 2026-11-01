import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O `zod` testa `Function('')` ao carregar e a CSP estrita registra isso como violação de
 * `script-src` (eval). O normalizador e o reporter vão para o navegador: nada de `zod` neles (#559).
 */
describe('Feature: Web Vitals no navegador sem zod (CSP, #559)', () => {
  it.each(['src/lib/web-vitals.ts', 'src/components/web-vitals-reporter.tsx'])(
    'Dado %s, Quando lê os imports, Então não importa zod nem o esquema do servidor',
    (file) => {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from 'zod'/);
      expect(source).not.toMatch(/import (?!type)[^;]*web-vitals-schema/s);
    },
  );
});
