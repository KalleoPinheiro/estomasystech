'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/**
 * Refaz a leitura do portal no servidor depois de uma gravação (#553): a tela
 * recebe os dados novos na próxima renderização, sem `useApiQuery` nem estado
 * duplicado no cliente. Mantém a tela atual enquanto a nova chega.
 */
export function usePortalRefresh(): () => void {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);
}
