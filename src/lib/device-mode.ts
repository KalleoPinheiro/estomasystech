import type { ThemeMode } from '@still-void/ui/react';
import { DEVICE_MODE_STORAGE_KEY, isDeviceMode } from './theme';

/**
 * Escolha de claro/escuro DESTE aparelho (#426). Sem `localStorage` (modo
 * privado, bloqueio) a escolha vale até recarregar a página, em memória: sem
 * isso o padrão da clínica desfaria o clique logo em seguida.
 */
let inMemory: ThemeMode | null = null;

export function readDeviceMode(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(DEVICE_MODE_STORAGE_KEY);
    if (isDeviceMode(stored)) return stored;
  } catch {
    // sem armazenamento: vale a memória
  }
  return inMemory;
}

export function writeDeviceMode(mode: ThemeMode): void {
  inMemory = mode;
  try {
    window.localStorage.setItem(DEVICE_MODE_STORAGE_KEY, mode);
  } catch {
    // modo privado ou armazenamento bloqueado: segue só em memória
  }
}

/** Esquece a escolha em memória (testes). */
export function resetDeviceModeMemory(): void {
  inMemory = null;
}
