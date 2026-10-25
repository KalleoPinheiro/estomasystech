'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from './client';

export interface ApiQueryResult<T> {
  data: T | null;
  error: string | null;
  /** Status HTTP do erro, quando houve resposta (ex.: 404 vira mensagem própria na tela). */
  errorStatus: number | null;
  isLoading: boolean;
  refresh: () => void;
}

interface SettledQuery<T> {
  /** URL a que o resultado pertence: dado de outra URL nunca é devolvido (#578). */
  url: string;
  /** `url:version` da requisição resolvida (sucesso ou erro). */
  key: string;
  data: T | null;
  error: string | null;
  errorStatus: number | null;
}

export function useApiQuery<T>(url: string | null): ApiQueryResult<T> {
  const [settled, setSettled] = useState<SettledQuery<T> | null>(null);
  const [version, setVersion] = useState(0);
  // Enquanto a chave atual (`url:version`) não coincidir com a da última
  // requisição resolvida, a requisição está pendente — deriva `isLoading` sem
  // precisar de um `setState` síncrono no corpo do efeito (proibido por
  // `react-hooks/set-state-in-effect`).
  const requestKey = `${url ?? ''}:${version}`;
  const isLoading = url != null && settled?.key !== requestKey;

  useEffect(() => {
    if (url == null) {
      return;
    }
    let cancelled = false;
    apiFetch<T>(url)
      .then((result) => {
        if (!cancelled) {
          setSettled({
            url,
            key: requestKey,
            data: result,
            error: null,
            errorStatus: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // A falha de outra URL descarta o dado anterior: a tela não pode seguir
          // desenhando um recorte que não é mais o pedido. Falha ao refazer a
          // mesma URL mantém o último dado dela (o chamador decide o que mostrar).
          setSettled((previous) => ({
            url,
            key: requestKey,
            data: previous?.url === url ? previous.data : null,
            error:
              err instanceof Error ? err.message : 'Erro ao carregar dados',
            errorStatus: err instanceof ApiError ? err.status : null,
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, requestKey]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  // Só vale o resultado da URL corrente; ao trocar de URL, o anterior some.
  const current = url != null && settled?.url === url ? settled : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    errorStatus: current?.errorStatus ?? null,
    isLoading,
    refresh,
  };
}
