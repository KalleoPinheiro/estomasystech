'use client';

import { useRouter } from 'next/navigation';
import { ErrorAlert } from '@/components/feedback';

/**
 * Erro de um bloco carregado no servidor (ADR-069): «Tentar novamente» pede ao
 * servidor para renderizar a tela de novo (`router.refresh()`), em vez de
 * repetir uma chamada `/api` do navegador.
 */
export function RefreshErrorAlert({ message }: { message: string }) {
  const router = useRouter();
  return <ErrorAlert message={message} onRetry={() => router.refresh()} />;
}
