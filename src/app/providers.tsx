'use client';

import {
  ThemeProvider,
  ToastProvider,
  TooltipProvider,
} from '@still-void/ui/react/client';
import type { ReactNode } from 'react';
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      defaultMode={DEFAULT_THEME_MODE}
      defaultAccent={DEFAULT_THEME_ACCENT}
      storageKey={THEME_STORAGE_KEY}
    >
      <ToastProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
