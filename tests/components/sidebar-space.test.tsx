// @vitest-environment jsdom

import { SidebarProvider } from '@still-void/ui/react/client';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarSpace } from '@/components/app-shell/sidebar-space';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubViewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
}

describe('Feature: espaço do menu lateral antes da hidratação (CLS, #544)', () => {
  it('Dado que o provider ainda diz «celular», Então reserva a largura do menu, visível só a partir de lg e fora da árvore de acessibilidade', () => {
    stubViewport(false);

    const { container } = render(
      <SidebarProvider>
        <SidebarSpace />
      </SidebarProvider>,
    );

    const space = container.querySelector('[aria-hidden="true"]');
    expect(space).not.toBeNull();
    expect(space?.className).toContain('w-56');
    expect(space?.className).toContain('hidden');
    expect(space?.className).toContain('lg:block');
  });

  it('Dado o desktop com o menu já renderizado, Então o espaço sai (o menu ocupa o lugar)', () => {
    stubViewport(true);

    const { container } = render(
      <SidebarProvider>
        <SidebarSpace />
      </SidebarProvider>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
