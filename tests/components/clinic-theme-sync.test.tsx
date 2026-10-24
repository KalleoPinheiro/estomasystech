// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { ThemeToggle } from '@/components/theme-toggle';
import type { ClinicTheme } from '@/domain/clinic/clinic-identity';
import { resetDeviceModeMemory } from '@/lib/device-mode';
import {
  CLINIC_THEME_EVENT,
  DEVICE_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

const root = document.documentElement;

type Listener = () => void;
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<Listener>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }));
  return {
    set(value: boolean) {
      matches = value;
      for (const l of listeners) l();
    },
    listeners,
  };
}

const mount = (theme: ClinicTheme) =>
  render(
    <Providers theme={theme}>
      <ThemeToggle />
    </Providers>,
  );

beforeEach(() => {
  resetDeviceModeMemory();
  localStorage.clear();
  root.setAttribute('data-theme', 'light');
  root.setAttribute('data-accent', 'violet');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: O app obedece o tema da clínica (#426)', () => {
  it('Dada clínica em âmbar e cor antiga guardada no aparelho, Quando abrir, Então a cor da clínica vence', () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode: 'light', accent: 'cyan' }),
    );

    mount({ mode: 'light', accent: 'amber' });

    expect(root.getAttribute('data-accent')).toBe('amber');
  });

  it('Dada clínica em escuro e aparelho sem escolha, Quando abrir, Então fica escuro', () => {
    mount({ mode: 'dark', accent: 'violet' });

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(
      screen.getByRole('button', { name: 'Usar tema claro' }),
    ).toBeTruthy();
  });

  it('Dada clínica em "seguir o aparelho" e aparelho escuro, Quando abrir, Então fica escuro', () => {
    stubMatchMedia(true);

    mount({ mode: 'system', accent: 'violet' });

    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('Dada clínica em "seguir o aparelho", Quando o aparelho muda para escuro, Então o app acompanha ao vivo', () => {
    const media = stubMatchMedia(false);
    mount({ mode: 'system', accent: 'violet' });
    expect(root.getAttribute('data-theme')).toBe('light');

    act(() => media.set(true));

    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('Dada escolha do aparelho por claro, Quando a clínica é escura, Então a escolha do aparelho vence e não acompanha o sistema', () => {
    const media = stubMatchMedia(true);
    localStorage.setItem(DEVICE_MODE_STORAGE_KEY, 'light');

    mount({ mode: 'system', accent: 'violet' });
    act(() => media.set(true));

    expect(root.getAttribute('data-theme')).toBe('light');
    expect(media.listeners.size).toBe(0);
  });

  it('Dada clínica em modo fixo, Então não fica ouvindo o aparelho', () => {
    const media = stubMatchMedia(false);

    mount({ mode: 'dark', accent: 'violet' });

    expect(media.listeners.size).toBe(0);
  });

  it('Dado armazenamento bloqueado, Quando abrir, Então segue o padrão da clínica sem erro', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });

    expect(() => mount({ mode: 'dark', accent: 'mint' })).not.toThrow();
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('Dada a tela de Configurações salvando um tema novo, Quando o evento chega, Então o app muda na hora', () => {
    mount({ mode: 'light', accent: 'violet' });

    act(() => {
      window.dispatchEvent(
        new CustomEvent<ClinicTheme>(CLINIC_THEME_EVENT, {
          detail: { mode: 'dark', accent: 'cyan' },
        }),
      );
    });

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-accent')).toBe('cyan');
  });

  it('Dada a navegação trazendo um tema novo do servidor, Então o app o adota', () => {
    const view = mount({ mode: 'light', accent: 'violet' });

    view.rerender(
      <Providers theme={{ mode: 'light', accent: 'mint' }}>
        <ThemeToggle />
      </Providers>,
    );

    expect(root.getAttribute('data-accent')).toBe('mint');
  });
});

describe('Feature: O botão do menu é a escolha deste aparelho (#426)', () => {
  it('Dada clínica em claro, Quando alternar para escuro, Então guarda a escolha do aparelho', () => {
    mount({ mode: 'light', accent: 'violet' });

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }));

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(DEVICE_MODE_STORAGE_KEY)).toBe('dark');
  });

  it('Dada escolha do aparelho, Quando a clínica troca o padrão, Então este aparelho mantém a escolha e adota a cor', () => {
    localStorage.setItem(DEVICE_MODE_STORAGE_KEY, 'dark');
    mount({ mode: 'light', accent: 'violet' });

    act(() => {
      window.dispatchEvent(
        new CustomEvent<ClinicTheme>(CLINIC_THEME_EVENT, {
          detail: { mode: 'light', accent: 'amber' },
        }),
      );
    });

    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-accent')).toBe('amber');
  });

  it('Dado armazenamento bloqueado, Quando alternar, Então o tema muda mesmo sem lembrar', () => {
    mount({ mode: 'light', accent: 'violet' });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('bloqueado');
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema escuro' }));

    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});
