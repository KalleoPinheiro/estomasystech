// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformLayout from '@/app/plataforma/layout';

const pathname = vi.hoisted(() => ({ current: '/plataforma' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathname.current,
}));

const renderAt = (path: string) => {
  pathname.current = path;
  render(
    <PlatformLayout>
      <p>conteúdo</p>
    </PlatformLayout>,
  );
  return within(screen.getByRole('navigation'));
};

/** C4 (#267): navegação fixa da área da plataforma. */
describe('Feature: navegação de /plataforma', () => {
  afterEach(() => {
    cleanup();
  });

  it('o topo tem os três links, nessa ordem', () => {
    const nav = renderAt('/plataforma');

    const links = nav.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Clínicas',
      'Auditoria',
      'Taxonomia',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/plataforma',
      '/plataforma/auditoria',
      '/plataforma/taxonomia',
    ]);
  });

  it.each([
    ['/plataforma', 'Clínicas'],
    ['/plataforma/clinicas/c1', 'Clínicas'],
    ['/plataforma/clinicas/nova', 'Clínicas'],
    ['/plataforma/auditoria', 'Auditoria'],
    ['/plataforma/taxonomia', 'Taxonomia'],
  ])('aria-current: em %s só %s fica marcado', (path, current) => {
    const nav = renderAt(path);

    for (const link of nav.getAllByRole('link')) {
      if (link.textContent === current) {
        expect(link).toHaveAttribute('aria-current', 'page');
      } else {
        expect(link).not.toHaveAttribute('aria-current');
      }
    }
  });
});
