'use client';

import {
  ThemeProvider,
  ToastProvider,
  TooltipProvider,
} from '@still-void/ui/react/client';
import type { ReactNode } from 'react';
import { ClinicThemeSync } from '@/components/clinic-theme-sync';
import type { ClinicTheme } from '@/domain/clinic/clinic-identity';
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

export function Providers({
  children,
  theme,
}: {
  children: ReactNode;
  theme?: ClinicTheme;
}) {
  return (
    <ThemeProvider
      defaultMode={DEFAULT_THEME_MODE}
      defaultAccent={DEFAULT_THEME_ACCENT}
      storageKey={THEME_STORAGE_KEY}
    >
      {theme && <ClinicThemeSync theme={theme} />}
      <ToastProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
