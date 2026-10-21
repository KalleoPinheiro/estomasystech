import { ValidationError } from '../shared/errors';

/**
 * Tema da clínica (#426): modo padrão e cor de acento, definidos pelo Admin de
 * Empresa e valendo para toda a equipe. O modo é só o PADRÃO: cada aparelho
 * pode escolher claro/escuro por conta própria. A cor não é livre — são as
 * quatro do Still Void, calibradas para contraste AA nos dois modos.
 */
export const THEME_MODES = ['light', 'dark', 'system'] as const;
export type ClinicThemeMode = (typeof THEME_MODES)[number];

export const THEME_ACCENTS = ['cyan', 'violet', 'mint', 'amber'] as const;
export type ClinicThemeAccent = (typeof THEME_ACCENTS)[number];

export interface ClinicTheme {
  mode: ClinicThemeMode;
  accent: ClinicThemeAccent;
}

/** Sem clínica identificada (login) ou sem escolha: segue o aparelho, em violeta. */
export const DEFAULT_CLINIC_THEME: ClinicTheme = {
  mode: 'system',
  accent: 'violet',
};

export const isThemeMode = (value: unknown): value is ClinicThemeMode =>
  THEME_MODES.includes(value as ClinicThemeMode);

export const isThemeAccent = (value: unknown): value is ClinicThemeAccent =>
  THEME_ACCENTS.includes(value as ClinicThemeAccent);

/** Valor gravado fora da lista (migração manual, dado antigo) cai no padrão, nunca quebra a tela. */
export const themeFromStored = (
  mode: unknown,
  accent: unknown,
): ClinicTheme => ({
  mode: isThemeMode(mode) ? mode : DEFAULT_CLINIC_THEME.mode,
  accent: isThemeAccent(accent) ? accent : DEFAULT_CLINIC_THEME.accent,
});

/** Entrada do Admin: os dois campos são obrigatórios e da lista fechada. */
export function parseClinicTheme(input: {
  mode?: unknown;
  accent?: unknown;
}): ClinicTheme {
  if (!isThemeMode(input.mode)) {
    throw new ValidationError(
      `Modo do tema inválido (use ${THEME_MODES.join(', ')})`,
    );
  }
  if (!isThemeAccent(input.accent)) {
    throw new ValidationError(
      `Cor do tema inválida (use ${THEME_ACCENTS.join(', ')})`,
    );
  }
  return { mode: input.mode, accent: input.accent };
}
