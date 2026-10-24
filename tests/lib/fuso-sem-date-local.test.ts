import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src/domain', 'src/application', 'src/app/api', 'src/lib'];

/**
 * Allowlist com justificativa (ADR-073): estes arquivos usam getters locais
 * de propósito, em "células de calendário" sem instante ou em aritmética pura.
 */
const ALLOWLIST: Record<string, string> = {
  'src/lib/clinic-calendar.ts':
    'converte célula de calendário do aparelho para o dia da clínica',
  'src/domain/shared/time-zone.ts': 'implementa o fuso explícito',
  'src/lib/app-timezone.ts': 'lê o fuso do processo só para a trava do boot',
};

const BANNED =
  /\.(getHours|getMinutes|getDay|getDate|getMonth|getFullYear|setHours|setDate|setMonth|setMinutes|setFullYear)\(|\bnew Date\(\s*\w+(\.\w+\(\))?,\s*[\w.() +-]+,|toLocale(Date|Time)?String\(\s*'pt-BR'\s*\)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.(ts|tsx)$/.test(name)
        ? [full]
        : [];
  });
}

describe('Feature: regras de data não leem o fuso do processo (ADR-073)', () => {
  it('Dado src/domain, application, api e lib, Quando varre, Então nenhum getter/setter local nem toLocale sem timeZone', () => {
    const offenders = ROOTS.flatMap(walk)
      .filter((file) => !ALLOWLIST[file.split(path.sep).join('/')])
      .filter((file) => BANNED.test(readFileSync(file, 'utf8')))
      .sort();
    expect(offenders).toEqual([]);
  });
});
