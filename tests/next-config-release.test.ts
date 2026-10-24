import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextReleaseVersion } from '@/lib/release-version';
import nextConfig, { APP_VERSION, RELEASE_VERSION } from '../next.config';

const pending = () =>
  readdirSync('.changeset')
    .filter((file) => file.endsWith('.md') && file !== 'README.md')
    .map((file) => readFileSync(`.changeset/${file}`, 'utf8'));

describe('Feature: Versão da release em andamento embutida no build (ADR-066)', () => {
  it('Dado changesets pendentes, Quando monta o build, Então a release em andamento sobe sobre o package.json', () => {
    expect(RELEASE_VERSION).toBe(nextReleaseVersion(APP_VERSION, pending()));
    expect(nextConfig.env?.NEXT_PUBLIC_RELEASE_VERSION).toBe(RELEASE_VERSION);
  });

  it('Dado a release 0.1.0 com changesets minor, Quando monta o build, Então a staging mostra 0.2.0 e não 0.1.0', () => {
    expect(
      nextReleaseVersion('0.1.0', [
        '---\n"estomasystech": minor\n---\n\nMudança.',
      ]),
    ).toBe('0.2.0');
  });
});
