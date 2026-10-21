// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clinicThemeScript,
  DEVICE_MODE_STORAGE_KEY,
  isDeviceMode,
  resolveThemeMode,
} from '@/lib/theme';

describe('Feature: Mapeamento do modo da clínica para o pacote (#426)', () => {
  it.each([
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
  ] as const)(
    'Dado o padrão %s e aparelho escuro=%s, Então o modo é %s',
    (mode, prefersDark, expected) => {
      expect(resolveThemeMode(mode, prefersDark)).toBe(expected);
    },
  );

  it('Dada a chave da escolha do aparelho, Então é própria do app e distinta da do pacote', () => {
    expect(DEVICE_MODE_STORAGE_KEY).toBe('estomasystech:modo-escolhido');
  });

  it('Dados valores guardados, Então só claro e escuro contam como escolha', () => {
    expect(isDeviceMode('light')).toBe(true);
    expect(isDeviceMode('dark')).toBe(true);
    expect(isDeviceMode('system')).toBe(false);
    expect(isDeviceMode(null)).toBe(false);
  });
});

describe('Feature: Script de tema antes da hidratação (#426)', () => {
  const root = document.documentElement;
  const run = (theme: Parameters<typeof clinicThemeScript>[0]) =>
    new Function(clinicThemeScript(theme))();
  const prefers = (dark: boolean) =>
    vi.stubGlobal('matchMedia', () => ({ matches: dark }));

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    root.removeAttribute('data-theme');
    root.removeAttribute('data-accent');
  });

  it('Dada clínica em escuro e sem escolha no aparelho, Então aplica escuro e a cor da clínica', () => {
    run({ mode: 'dark', accent: 'mint' });
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-accent')).toBe('mint');
  });

  it('Dada clínica em "seguir o aparelho" e aparelho escuro, Então aplica escuro', () => {
    prefers(true);
    run({ mode: 'system', accent: 'violet' });
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('Dada clínica em "seguir o aparelho" e aparelho claro, Então aplica claro', () => {
    prefers(false);
    run({ mode: 'system', accent: 'violet' });
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('Dada escolha do aparelho, Então ela vence o padrão da clínica', () => {
    localStorage.setItem(DEVICE_MODE_STORAGE_KEY, 'light');
    run({ mode: 'dark', accent: 'cyan' });
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('Dada cor antiga guardada pelo pacote no aparelho, Então a cor da clínica vence', () => {
    localStorage.setItem(
      'estomasystech:modo',
      JSON.stringify({ mode: 'light', accent: 'amber' }),
    );
    run({ mode: 'light', accent: 'cyan' });
    expect(root.getAttribute('data-accent')).toBe('cyan');
  });

  it('Dado valor inválido guardado como escolha, Então ignora e usa o padrão da clínica', () => {
    localStorage.setItem(DEVICE_MODE_STORAGE_KEY, 'system');
    run({ mode: 'dark', accent: 'cyan' });
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('Dado armazenamento bloqueado, Então aplica o padrão da clínica sem lançar erro', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => run({ mode: 'dark', accent: 'mint' })).not.toThrow();
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('Dado o script, Então não carrega "</" que feche a tag e traz os valores como texto', () => {
    const script = clinicThemeScript({ mode: 'dark', accent: 'mint' });
    expect(script).not.toContain('</');
    expect(script).toContain('"dark"');
    expect(script).toContain('"mint"');
  });
});
