import { describe, expect, it } from 'vitest';
import { changesetBump, nextReleaseVersion } from '@/lib/release-version';

const changeset = (level: string) =>
  `---\n"estomasystech": ${level}\n---\n\nTexto.\n`;

describe('Feature: Versão da release em andamento (ADR-066)', () => {
  it.each(['major', 'minor', 'patch'] as const)(
    'Dado um changeset %s, Quando lê o nível, Então devolve %s',
    (level) => {
      expect(changesetBump(changeset(level))).toBe(level);
    },
  );

  it('Dado um changeset sem pacote ou sem frontmatter, Quando lê, Então nulo', () => {
    expect(changesetBump('---\n---\nSó texto')).toBeNull();
    expect(changesetBump('sem frontmatter')).toBeNull();
  });

  it('Dado vários pacotes no mesmo changeset, Quando lê, Então vale o maior nível', () => {
    expect(changesetBump('---\n"a": patch\n"b": minor\n---\nTexto')).toBe(
      'minor',
    );
  });

  it('Dado 0.1.0 e changesets patch e minor, Quando calcula, Então a release é 0.2.0', () => {
    expect(
      nextReleaseVersion('0.1.0', [changeset('patch'), changeset('minor')]),
    ).toBe('0.2.0');
  });

  it('Dado 0.2.3 e só patch, Quando calcula, Então 0.2.4', () => {
    expect(nextReleaseVersion('0.2.3', [changeset('patch')])).toBe('0.2.4');
  });

  it('Dado um changeset major, Quando calcula, Então sobe o primeiro número', () => {
    expect(
      nextReleaseVersion('0.9.1', [changeset('minor'), changeset('major')]),
    ).toBe('1.0.0');
  });

  it('Dado a ordem inversa (major antes de minor), Quando calcula, Então continua major', () => {
    expect(
      nextReleaseVersion('0.9.1', [changeset('major'), changeset('minor')]),
    ).toBe('1.0.0');
  });

  it('Dado nenhum changeset pendente, Quando calcula, Então vale a versão atual', () => {
    expect(nextReleaseVersion('0.2.0', [])).toBe('0.2.0');
    expect(nextReleaseVersion('0.2.0', ['---\n---\n'])).toBe('0.2.0');
  });

  it('Dada uma versão com prerelease, Quando calcula, Então não mexe', () => {
    expect(nextReleaseVersion('1.0.0-rc.1', [changeset('minor')])).toBe(
      '1.0.0-rc.1',
    );
  });
});
