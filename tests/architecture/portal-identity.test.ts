import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src/app/api/portal', 'src/application/portal'];
/** Único arquivo que consulta conta por e-mail — o e-mail de LOGIN da sessão. */
const ALLOWED = new Set(['src/application/portal/portal-identity.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('Arquitetura: identidade do portal (#196)', () => {
  it('portal never resolves by email: nenhuma rota/use case do portal chama findByEmail', () => {
    const offenders = ROOTS.flatMap(sourceFiles)
      .map((file) => file.split(path.sep).join('/'))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => /\.findByEmail\(/.test(readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('o resolvedor só consulta por e-mail a conta de login, nunca paciente/parceiro', () => {
    const source = readFileSync(
      'src/application/portal/portal-identity.ts',
      'utf8',
    );
    const calls = source.match(/\w+\.findByEmail\(/g) ?? [];

    expect(calls).toEqual(['accounts.findByEmail(']);
  });
});
