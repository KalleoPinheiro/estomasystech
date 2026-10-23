import { describe, expect, it } from 'vitest';
import {
  isSemver,
  parseGitSha,
  parseReleaseNotes,
  parseReleaseVersion,
} from '@/domain/release/release-version';
import { ValidationError } from '@/domain/shared/errors';

describe('Feature: Dados da release gravada no banco (ADR-066)', () => {
  it('Dado uma versão semver com espaços, Quando valida, Então devolve a versão limpa', () => {
    expect(parseReleaseVersion(' 0.2.0 ')).toBe('0.2.0');
    expect(isSemver('1.0.0-rc.1')).toBe(true);
  });

  it.each([undefined, '', 'latest', '1.0', '<script>'])(
    'Dada a versão %j, Quando valida, Então recusa',
    (value) => {
      expect(() => parseReleaseVersion(value)).toThrow(ValidationError);
    },
  );

  it('Dado um SHA hexadecimal, Quando valida, Então guarda em minúsculas', () => {
    expect(parseGitSha('F64B7AF2064C')).toBe('f64b7af2064c');
  });

  it.each([undefined, '', 'não-é-sha', 'abc'])(
    'Dado o SHA %j, Quando valida, Então vira nulo',
    (value) => {
      expect(parseGitSha(value)).toBeNull();
    },
  );

  it('Dada uma nota vazia, Quando valida, Então vira nula', () => {
    expect(parseReleaseNotes('   ')).toBeNull();
    expect(parseReleaseNotes(undefined)).toBeNull();
  });

  it('Dada uma nota longa, Quando valida, Então corta em 500 caracteres', () => {
    expect(parseReleaseNotes(`  ${'a'.repeat(600)}`)).toHaveLength(500);
  });
});
