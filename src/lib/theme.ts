import type { AccentName, ThemeMode } from '@still-void/ui/react';

/**
 * Tema padrão do app: claro + violeta, o visual de antes da fundação de tema
 * (#425). A clínica vai poder trocar cor e modo padrão (#426); até lá, estes
 * valores são renderizados no `<html>` pelo servidor.
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'light';
export const DEFAULT_THEME_ACCENT: AccentName = 'violet';

/**
 * Chave do `localStorage` da preferência claro/escuro DO APARELHO. O
 * `ThemeScript` (antes da hidratação) e o `ThemeProvider` precisam da mesma
 * chave, ou a página pisca no tema errado.
 */
export const THEME_STORAGE_KEY = 'estomasystech:modo';

/** Rótulo da ação (para onde o botão leva), em pt-BR — o `ThemeToggle` do pacote é em inglês. */
export function themeToggleLabel(mode: ThemeMode): string {
  return mode === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
}
