'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * `false` no HTML do servidor e na hidratação, `true` assim que o React assumiu
 * a página. Serve para deixar `disabled` um botão que ainda não responde, em vez
 * de um clique perdido sem aviso (#484).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
