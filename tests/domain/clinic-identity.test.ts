import { describe, expect, it } from 'vitest';
import { Clinic } from '@/domain/clinic/clinic';
import {
  DEFAULT_CLINIC_THEME,
  isThemeAccent,
  isThemeMode,
  parseClinicTheme,
  THEME_ACCENTS,
  THEME_MODES,
  themeFromStored,
} from '@/domain/clinic/clinic-identity';
import { ValidationError } from '@/domain/shared/errors';

const aClinic = (extra: { themeMode?: string; themeAccent?: string } = {}) =>
  Clinic.restore({
    id: 'c1',
    name: 'Clínica',
    createdBy: 'a',
    createdAt: new Date(),
    ...extra,
  });

describe('Feature: Tema da clínica (#426)', () => {
  it('Dado nenhuma escolha, Então o padrão segue o aparelho em violeta', () => {
    expect(DEFAULT_CLINIC_THEME).toEqual({ mode: 'system', accent: 'violet' });
  });

  it('Dadas as listas fechadas, Então são exatamente os modos e as 4 cores do Still Void', () => {
    expect([...THEME_MODES]).toEqual(['light', 'dark', 'system']);
    expect([...THEME_ACCENTS]).toEqual(['cyan', 'violet', 'mint', 'amber']);
  });

  describe('Cenário: validação da escolha do Admin', () => {
    it.each(
      THEME_MODES.flatMap((mode) =>
        THEME_ACCENTS.map((accent) => [mode, accent] as const),
      ),
    )('Dado modo %s e cor %s, Quando validar, Então aceita', (mode, accent) => {
      expect(parseClinicTheme({ mode, accent })).toEqual({ mode, accent });
    });

    it.each([undefined, null, '', 'auto', 'Dark', 1])(
      'Dado o modo %j, Quando validar, Então recusa com a lista de modos',
      (mode) => {
        expect(() => parseClinicTheme({ mode, accent: 'cyan' })).toThrow(
          new ValidationError(
            'Modo do tema inválido (use light, dark, system)',
          ),
        );
      },
    );

    it.each([undefined, null, '', '#ff0000', 'red', 'Cyan'])(
      'Dado a cor %j (sem cor livre), Quando validar, Então recusa com a lista de cores',
      (accent) => {
        expect(() => parseClinicTheme({ mode: 'light', accent })).toThrow(
          new ValidationError(
            'Cor do tema inválida (use cyan, violet, mint, amber)',
          ),
        );
      },
    );
  });

  describe('Cenário: valor gravado', () => {
    it('Dado valores da lista, Quando restaurar, Então são mantidos', () => {
      expect(themeFromStored('dark', 'amber')).toEqual({
        mode: 'dark',
        accent: 'amber',
      });
    });

    it('Dado valor fora da lista, Quando restaurar, Então cada campo cai no padrão sem quebrar', () => {
      expect(themeFromStored('neon', 'dark')).toEqual(DEFAULT_CLINIC_THEME);
      expect(themeFromStored('light', 'x')).toEqual({
        mode: 'light',
        accent: 'violet',
      });
      expect(themeFromStored('x', 'mint')).toEqual({
        mode: 'system',
        accent: 'mint',
      });
    });

    it('Dados os guardas de tipo, Então só aceitam a lista', () => {
      expect(isThemeMode('system')).toBe(true);
      expect(isThemeMode('violet')).toBe(false);
      expect(isThemeAccent('violet')).toBe(true);
      expect(isThemeAccent('system')).toBe(false);
    });
  });

  describe('Cenário: a clínica guarda o tema', () => {
    it('Dada clínica sem escolha, Então vale o padrão', () => {
      expect(aClinic().theme).toEqual(DEFAULT_CLINIC_THEME);
    });

    it('Dada clínica com dado inválido gravado, Então vale o padrão', () => {
      expect(aClinic({ themeMode: 'x', themeAccent: 'y' }).theme).toEqual(
        DEFAULT_CLINIC_THEME,
      );
    });

    it('Dado um tema, Quando trocar, Então devolve outra instância e a original não muda', () => {
      const clinic = aClinic();

      const changed = clinic.withTheme({ mode: 'dark', accent: 'mint' });

      expect(changed.theme).toEqual({ mode: 'dark', accent: 'mint' });
      expect(clinic.theme).toEqual(DEFAULT_CLINIC_THEME);
      expect(changed.name).toBe(clinic.name);
    });
  });
});
