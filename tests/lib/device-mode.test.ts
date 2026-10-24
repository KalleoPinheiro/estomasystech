// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readDeviceMode,
  resetDeviceModeMemory,
  writeDeviceMode,
} from '@/lib/device-mode';
import { DEVICE_MODE_STORAGE_KEY } from '@/lib/theme';

beforeEach(() => {
  resetDeviceModeMemory();
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Feature: Escolha de claro/escuro do aparelho (#426)', () => {
  it('Dado aparelho sem escolha, Então não há escolha', () => {
    expect(readDeviceMode()).toBeNull();
  });

  it('Dada uma escolha, Quando gravar, Então fica no aparelho e volta na leitura', () => {
    writeDeviceMode('dark');

    expect(localStorage.getItem(DEVICE_MODE_STORAGE_KEY)).toBe('dark');
    expect(readDeviceMode()).toBe('dark');
  });

  it('Dado valor inválido guardado, Quando ler, Então ignora', () => {
    localStorage.setItem(DEVICE_MODE_STORAGE_KEY, 'system');

    expect(readDeviceMode()).toBeNull();
  });

  it('Dado armazenamento bloqueado, Quando gravar e ler, Então a escolha vale em memória', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });

    writeDeviceMode('light');

    expect(readDeviceMode()).toBe('light');
  });
});
