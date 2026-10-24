import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  themeToggleLabel,
} from '@/lib/theme';

describe('Feature: Fundação de tema (#425)', () => {
  it('Dado uma clínica sem identidade, Então o padrão é claro e violeta', () => {
    expect(DEFAULT_THEME_MODE).toBe('light');
    expect(DEFAULT_THEME_ACCENT).toBe('violet');
  });

  it('Dado a preferência do aparelho, Então a chave é a do app e não a do pacote', () => {
    expect(THEME_STORAGE_KEY).toBe('estomasystech:modo');
  });

  it.each([
    ['light', 'Usar tema escuro'],
    ['dark', 'Usar tema claro'],
  ] as const)(
    'Dado o modo %s, Quando pedir o rótulo, Então diz para onde o botão leva: %s',
    (mode, label) => {
      expect(themeToggleLabel(mode)).toBe(label);
    },
  );
});
