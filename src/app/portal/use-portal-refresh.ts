'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useTransition } from 'react';

/** Teto da espera pela releitura: rede muito lenta não prende a tela. */
const REFRESH_WAIT_LIMIT_MS = 15_000;

/**
 * Refaz a leitura do portal no servidor depois de uma gravação (#553): a tela
 * recebe os dados novos na próxima renderização, sem `useApiQuery` nem estado
 * duplicado no cliente. Mantém a tela atual enquanto a nova chega.
 *
 * Devolve uma promessa que se resolve quando a releitura termina (a transição
 * sai de pendente): quem mostra um estado provisório até lá o larga sem piscar
 * entre o dado antigo e o novo (#623, CLS).
 */
export function usePortalRefresh(): () => Promise<void> {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const waiting = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (pending) return;
    for (const resolve of waiting.current.splice(0)) resolve();
  }, [pending]);

  return useCallback(
    () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, REFRESH_WAIT_LIMIT_MS);
        waiting.current.push(() => {
          clearTimeout(timer);
          resolve();
        });
        startTransition(() => router.refresh());
      }),
    [router],
  );
}
