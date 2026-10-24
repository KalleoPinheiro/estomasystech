// @vitest-environment jsdom

import { ThemeScript } from '@still-void/ui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Providers } from '@/app/providers';
import { ThemeToggle } from '@/components/theme-toggle';
import { THEME_STORAGE_KEY } from '@/lib/theme';

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  root.setAttribute('data-theme', 'light');
  root.setAttribute('data-accent', 'violet');
});

afterEach(() => {
  cleanup();
});

describe('Feature: Alternar claro/escuro no aparelho', () => {
  it('Dado o tema padrão, Quando abrir o app, Então o botão oferece o tema escuro', () => {
    render(
      <Providers>
        <ThemeToggle />
      </Providers>,
    );

    expect(
      screen.getByRole('button', { name: 'Usar tema escuro' }),
    ).toHaveTextContent('Tema escuro');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.getAttribute('data-accent')).toBe('violet');
  });

  it('Dado o tema claro, Quando alternar, Então o app fica escuro e a escolha fica salva no aparelho', () => {
    render(
      <Providers>
        <ThemeToggle />
      </Providers>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }));

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-accent')).toBe('violet');
    expect(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? '{}')).toEqual(
      { mode: 'dark', accent: 'violet' },
    );
    expect(
      screen.getByRole('button', { name: 'Usar tema claro' }),
    ).toHaveTextContent('Tema claro');
  });

  it('Dado que a pessoa já escolheu escuro, Quando voltar ao app, Então segue escuro e oferece o claro', () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode: 'dark', accent: 'violet' }),
    );

    render(
      <Providers>
        <ThemeToggle />
      </Providers>,
    );

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: 'Usar tema claro' }),
    ).toBeInTheDocument();
  });

  it('Dado o escuro salvo, Quando o script de tema rodar antes da hidratação, Então o html já nasce escuro', () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode: 'dark', accent: 'violet' }),
    );
    const { container } = render(
      <ThemeScript storageKey={THEME_STORAGE_KEY} nonce="n0nce" />,
    );
    const script = container.querySelector('script');
    expect(script?.getAttribute('nonce')).toBe('n0nce');

    new Function(script?.innerHTML ?? '')();

    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});
