import { describe, expect, it } from 'vitest';
import { resolveBase } from '../../scripts/gate/base';

describe('Base do diff dos gates locais (ADR-058)', () => {
  it('Dado feat com release aberta, quando resolve a base, então compara com a release', () => {
    expect(
      resolveBase({
        branch: 'feat/fichas',
        openReleases: ['origin/release/v0.2.0'],
      }),
    ).toBe('origin/release/v0.2.0');
  });

  it('Dado duas releases abertas, quando resolve, então vence a de versão maior', () => {
    expect(
      resolveBase({
        branch: 'feat/x',
        openReleases: [
          'origin/release/v0.9.0',
          'origin/release/v0.10.0',
          'origin/release/v0.2.5',
        ],
      }),
    ).toBe('origin/release/v0.10.0');
  });

  it('Dado feat sem release aberta, quando resolve, então compara com a main', () => {
    expect(resolveBase({ branch: 'feat/x', openReleases: [] })).toBe(
      'origin/main',
    );
  });

  it('Dado PR release→main ou hotfix, quando resolve, então a base é sempre a main', () => {
    const openReleases = ['origin/release/v0.2.0'];
    expect(resolveBase({ branch: 'release/v0.2.0', openReleases })).toBe(
      'origin/main',
    );
    expect(resolveBase({ branch: 'hotfix/falha', openReleases })).toBe(
      'origin/main',
    );
    expect(resolveBase({ branch: 'staging', openReleases })).toBe(
      'origin/main',
    );
  });

  it('Dado GATE_BASE explícito, quando resolve, então ele vence qualquer detecção', () => {
    expect(
      resolveBase({
        explicit: 'origin/outra',
        branch: 'release/v0.2.0',
        openReleases: [],
      }),
    ).toBe('origin/outra');
  });

  it('Dado ref fora do padrão de release, quando resolve, então é ignorada', () => {
    expect(
      resolveBase({ branch: 'feat/x', openReleases: ['origin/release/v0.2'] }),
    ).toBe('origin/main');
  });
});
