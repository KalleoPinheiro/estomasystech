import { type AccentName, colors, type ThemeMode } from '@still-void/ui/react';
import type {
  ClinicTheme,
  ClinicThemeMode,
} from '@/domain/clinic/clinic-identity';

/**
 * Tema padrão do app: claro + violeta, o visual de antes da fundação de tema
 * (#425). Com a identidade da clínica (#426) o servidor renderiza o tema dela
 * no `<html>`; estes valores só valem de reserva (sem clínica, o padrão é
 * `DEFAULT_CLINIC_THEME`: segue o aparelho, em violeta).
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

/** Cor da barra do navegador/status bar (`theme-color`): o fundo literal do Still Void. */
export const THEME_COLOR_LIGHT = colors.light.bg;
export const THEME_COLOR_DARK = colors.dark.bg;

/**
 * Claro/escuro que ESTE aparelho escolheu pelo botão (#426). Só existe depois
 * de um clique: sem ele vale o padrão da clínica. Chave à parte da do pacote
 * porque o `ThemeProvider` grava o estado inteiro no `localStorage` já na
 * montagem, o que faria um padrão da clínica parecer escolha do aparelho.
 */
export const DEVICE_MODE_STORAGE_KEY = 'estomasystech:modo-escolhido';

export const isDeviceMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark';

/**
 * O pacote só conhece `light` e `dark`: o padrão `system` da clínica vira o que
 * o aparelho pede (`prefers-color-scheme`) e, sem essa informação (servidor),
 * claro.
 */
export function resolveThemeMode(
  mode: ClinicThemeMode,
  prefersDark: boolean,
): ThemeMode {
  if (mode === 'system') return prefersDark ? 'dark' : 'light';
  return mode;
}

/**
 * Script inline antes da hidratação (substitui o `ThemeScript` do pacote, que
 * deixaria o valor guardado no aparelho vencer a cor da clínica): aplica a
 * cor da clínica e o modo escolhido no aparelho, ou o padrão da clínica.
 */
export function clinicThemeScript(theme: ClinicTheme): string {
  const literal = (value: string) =>
    JSON.stringify(value).replace(/</g, '\\u003c');
  return `(function(){try{var r=document.documentElement,m=${literal(theme.mode)},c=null;try{c=localStorage.getItem(${literal(DEVICE_MODE_STORAGE_KEY)})}catch(e){}if(c!=="light"&&c!=="dark"){c=m==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m}r.setAttribute("data-theme",c);r.setAttribute("data-accent",${literal(theme.accent)})}catch(e){}})();`;
}

/** Evento da janela que a tela de Configurações dispara ao salvar: o app troca de cor sem recarregar. */
export const CLINIC_THEME_EVENT = 'estomasystech:tema-da-clinica';
