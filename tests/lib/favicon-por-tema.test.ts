import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { metadata } from '@/app/layout';
import { isPublicPath } from '@/lib/auth/access-policy';

vi.mock('next/font/local', () => ({
  default: () => ({ variable: '', className: '' }),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/clinic-theme-server', () => ({ loadClinicTheme: vi.fn() }));
vi.mock('@/components/staging-banner', () => ({ StagingBanner: () => null }));

const icones = Array.isArray(metadata.icons)
  ? []
  : ((metadata.icons as { icon?: Array<{ url: string; media?: string }> })
      ?.icon ?? []);

describe('Feature: favicon que acompanha o tema do navegador', () => {
  it('Dado o navegador em tema claro ou escuro, Quando escolher o favicon, Então há um ícone para cada tema', () => {
    const porTema = Object.fromEntries(
      icones.map((i) => [i.media, i.url] as const),
    );

    expect(porTema['(prefers-color-scheme: light)']).toBe(
      '/brand/favicon-grafite.svg',
    );
    expect(porTema['(prefers-color-scheme: dark)']).toBe(
      '/brand/favicon-branco.svg',
    );
  });

  it('Dado um visitante sem sessão, Quando pedir o favicon, Então os dois arquivos existem e são públicos', () => {
    for (const { url } of icones) {
      expect(isPublicPath(url)).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', url))).toBe(true);
    }
  });
});
