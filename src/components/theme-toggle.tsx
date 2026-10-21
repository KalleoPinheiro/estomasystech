'use client';

import { Button } from '@still-void/ui/react';
import { useTheme } from '@still-void/ui/react/client';
import { writeDeviceMode } from '@/lib/device-mode';
import { themeToggleLabel } from '@/lib/theme';

/**
 * Alterna claro/escuro neste aparelho (a preferência fica no navegador, não na
 * conta). Reimplementa o `ThemeToggle` do Still Void só para o texto em pt-BR.
 */
export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const label = themeToggleLabel(mode);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="self-start"
      aria-label={label}
      onClick={() => {
        writeDeviceMode(mode === 'dark' ? 'light' : 'dark');
        toggleMode();
      }}
    >
      {mode === 'dark' ? 'Tema claro' : 'Tema escuro'}
    </Button>
  );
}
