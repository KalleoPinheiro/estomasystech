import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #197: telas chamavam `/api/patients` (paginado, 100 por padrão) sem
 * cursor e usavam a 1ª página como lista completa. Seleção de paciente é por
 * busca (`PatientPicker`); a única listagem sem `search` é a própria tela de
 * Pacientes, que pagina por cursor com "Carregar mais".
 */
const APP_ROOT = path.join(process.cwd(), 'src', 'app');
const ALLOWED = new Set(['(staff)/pacientes/page.tsx']);

function collect(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('Varredura: seletores de paciente (#197)', () => {
  it('C34 telas não usam a listagem paginada como lista completa', () => {
    const offenders = collect(APP_ROOT)
      .map((file) => path.relative(APP_ROOT, file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) =>
        /useApiQuery<[^>]*>\(\s*['"`]\/api\/patients['"`?]/.test(
          readFileSync(path.join(APP_ROOT, file), 'utf8'),
        ),
      );

    expect(offenders).toEqual([]);
  });
});
