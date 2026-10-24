'use client';

import {
  ThemeProvider,
  ToastProvider,
  TooltipProvider,
} from '@still-void/ui/react/client';
import { setNonce } from 'get-nonce';
import type { ReactNode } from 'react';
import { ClinicThemeSync } from '@/components/clinic-theme-sync';
import { HydrationMark } from '@/components/hydration-mark';
import type { ClinicTheme } from '@/domain/clinic/clinic-identity';
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

export function Providers({
  children,
  theme,
  nonce,
}: {
  children: ReactNode;
  theme?: ClinicTheme;
  /** Nonce da CSP da requisição (`x-nonce`, src/proxy.ts). */
  nonce?: string;
}) {
  // O `<style>` de bloqueio de rolagem (react-remove-scroll) lê o nonce daqui; sem
  // ele a CSP o bloqueia ao abrir modal (#562). Só no cliente: o módulo é compartilhado
  // entre requisições no servidor, e o estilo só é injetado em efeito.
  if (nonce && typeof window !== 'undefined') setNonce(nonce);
  return (
    <ThemeProvider
      defaultMode={DEFAULT_THEME_MODE}
      defaultAccent={DEFAULT_THEME_ACCENT}
      storageKey={THEME_STORAGE_KEY}
    >
      <HydrationMark />
      {theme && <ClinicThemeSync theme={theme} />}
      <ToastProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
