import { describe, expect, it } from 'vitest';
import {
  changelogSection,
  hasChangesetFile,
  isSemver,
  migrationsIn,
  parseRollback,
  pendingChangesets,
  releaseBody,
  requiresChangeset,
  tagFor,
} from '../../scripts/release/lib';

describe('Feature: PR que muda produção exige changeset (ADR-043)', () => {
  it.each([['src/app/page.tsx'], ['drizzle/0067_x.sql'], ['Dockerfile']])(
    'Dado que o PR toca %s, Então exige changeset',
    (file) => {
      expect(requiresChangeset([file, 'docs/x.md'])).toBe(true);
    },
  );

  it('Dado um PR só de docs e CI, Então não exige changeset', () => {
    expect(
      requiresChangeset([
        'docs/x.md',
        '.github/workflows/ci.yml',
        'tests/a.test.ts',
      ]),
    ).toBe(false);
  });

  it('Dado um .changeset/*.md novo, Então conta; README e config não contam', () => {
    expect(hasChangesetFile(['.changeset/lazy-owls-fly.md'])).toBe(true);
    expect(
      hasChangesetFile(['.changeset/README.md', '.changeset/config.json']),
    ).toBe(false);
  });

  it('Dado a lista de arquivos, Quando busca pendentes, Então ignora README', () => {
    expect(
      pendingChangesets([
        '.changeset/a.md',
        '.changeset/README.md',
        'src/x.ts',
      ]),
    ).toEqual(['.changeset/a.md']);
  });
});

describe('Feature: Release com tag e notas (ADR-043)', () => {
  const changelog = [
    '# estomasystech',
    '',
    '## 0.3.0',
    '',
    '### Minor Changes',
    '',
    '- a1: Nova tela',
    '',
    '## 0.2.0',
    '',
    '### Patch Changes',
    '',
    '- b2: Correção',
    '',
  ].join('\n');

  it('Dado o CHANGELOG, Quando extrai 0.2.0, Então traz só a seção dela', () => {
    expect(changelogSection(changelog, '0.2.0')).toBe(
      '### Patch Changes\n\n- b2: Correção',
    );
  });

  it('Dado a seção mais recente, Quando extrai 0.3.0, Então para na seguinte', () => {
    expect(changelogSection(changelog, '0.3.0')).toBe(
      '### Minor Changes\n\n- a1: Nova tela',
    );
  });

  it('Dado versão ausente, Quando extrai, Então devolve null', () => {
    expect(changelogSection(changelog, '9.9.9')).toBeNull();
  });

  it('Dado a lista de arquivos, Quando busca migrações, Então devolve os números em ordem', () => {
    expect(
      migrationsIn([
        'drizzle/0067_b.sql',
        'drizzle/0066_a.sql',
        'drizzle/meta/_journal.json',
      ]),
    ).toEqual(['0066', '0067']);
  });

  it('Dado migrações e rollback por backup, Quando monta a Release, Então declara os dois', () => {
    const body = releaseBody({
      version: '0.3.0',
      section: '### Minor Changes',
      migrations: ['0067'],
      rollback: 'backup',
    });

    expect(body).toContain('Migrações neste lote: 0067.');
    expect(body).toContain('restaurar o backup');
  });

  it('Dado lote sem migração e rollback por redeploy, Então diz que não há migração', () => {
    const body = releaseBody({
      version: '0.3.0',
      section: 'x',
      migrations: [],
      rollback: 'redeploy',
    });

    expect(body).toContain('Nenhuma migração neste lote.');
    expect(body).toContain('redeploy da tag anterior');
  });

  it('Dado valores soltos, Então valida semver, tag e rollback', () => {
    expect(isSemver('0.2.0')).toBe(true);
    expect(isSemver('0.2')).toBe(false);
    expect(tagFor('0.2.0')).toBe('v0.2.0');
    expect(parseRollback('backup')).toBe('backup');
    expect(parseRollback('nada')).toBeNull();
    expect(parseRollback(undefined)).toBeNull();
  });
});
