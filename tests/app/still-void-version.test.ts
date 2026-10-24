import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layout mobile-first, Landing door 3 (C35): as regras de tela estreita, toque e
 * tabela empilhada vêm da `@still-void/ui@3.4.0` ou superior (3.4.1 traz o contraste da tinta clara, #424; 3.5.0 traz o BottomSheet da ficha no celular; 3.5.1 traz o alvo de toque de 44px abaixo de 64rem). O app precisa declarar e ter
 * instalada essa versão, ou os workarounds `sv-gap` removidos voltam a faltar.
 */
const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf-8')) as {
    version?: string;
    dependencies?: Record<string, string>;
  };

function atLeast(version: string, minimum: [number, number, number]): boolean {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i += 1) {
    if ((parts[i] ?? 0) !== minimum[i]) return (parts[i] ?? 0) > minimum[i];
  }
  return true;
}

describe('Feature: dependência do design system', () => {
  it('app depende da still-void 3.5.1 publicada', () => {
    const range = readJson('package.json').dependencies?.['@still-void/ui'];
    expect(range).toBe('^3.5.1');
    const installed =
      readJson('node_modules/@still-void/ui/package.json').version ?? '';
    expect(atLeast(installed, [3, 5, 1])).toBe(true);
  });
});
