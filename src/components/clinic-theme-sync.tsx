'use client';

import { useTheme } from '@still-void/ui/react/client';
import { useEffect, useState } from 'react';
import type { ClinicTheme } from '@/domain/clinic/clinic-identity';
import { readDeviceMode } from '@/lib/device-mode';
import { CLINIC_THEME_EVENT, resolveThemeMode } from '@/lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Navegadores muito antigos e o jsdom não têm `matchMedia`: sem ele, vale claro. */
const prefersDarkQuery = () =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY)
    : null;

/**
 * Faz o `ThemeProvider` obedecer a clínica (#426). O pacote guarda modo e cor
 * no `localStorage` e o valor guardado vence o do servidor; por isso a cor da
 * clínica é reaplicada em toda montagem. O modo é o escolhido no aparelho ou,
 * sem escolha, o padrão da clínica (`system` acompanha o aparelho, ao vivo).
 * Não renderiza nada.
 */
export function ClinicThemeSync({ theme: served }: { theme: ClinicTheme }) {
  const { mode, accent, setMode, setAccent } = useTheme();
  // O servidor só relê o tema na próxima navegação; ao salvar, a tela de
  // Configurações avisa por evento e o app muda na hora.
  const [theme, setTheme] = useState(served);
  useEffect(() => setTheme(served), [served]);
  useEffect(() => {
    const onChange = (event: Event) =>
      setTheme((event as CustomEvent<ClinicTheme>).detail);
    window.addEventListener(CLINIC_THEME_EVENT, onChange);
    return () => window.removeEventListener(CLINIC_THEME_EVENT, onChange);
  }, []);

  // Os efeitos dos filhos rodam antes do gerenciador do provider existir: a
  // primeira passada não faz nada, e a seguinte (o provider atualiza o estado
  // ao montar) aplica. Só age quando difere, para não entrar em laço.
  useEffect(() => {
    if (accent !== theme.accent) setAccent(theme.accent);
    const query = prefersDarkQuery();
    const choice = readDeviceMode();
    const target =
      choice ?? resolveThemeMode(theme.mode, query?.matches ?? false);
    if (mode !== target) setMode(target);
    if (choice || theme.mode !== 'system' || !query) return;
    const follow = () => setMode(resolveThemeMode('system', query.matches));
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, [mode, accent, theme.mode, theme.accent, setMode, setAccent]);

  return null;
}
