'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetchPage } from './client';

export interface CursorPagedQueryResult<T> {
  items: T[] | null;
  hasMore: boolean;
  error: string | null;
  /** true enquanto a 1ª página da `baseUrl` atual está em voo (PRONT-10) — `items` mantém o valor
   * anterior nesse meio-tempo, para o consumidor decidir como sinalizar "desatualizado". */
  isLoading: boolean;
  refresh: () => void;
  loadMore: () => void;
}

/**
 * Lista paginada por cursor (issue #75): primeira página via effect (recarrega
 * quando a URL base muda), páginas seguintes anexadas via loadMore(). Mesma
 * interface pública de `usePagedQuery` (offset) — troca é só o import na página.
 */
export function useCursorPagedQuery<T>(
  baseUrl: string,
  pageSize: number,
): CursorPagedQueryResult<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Chave da última 1ª página já resolvida (sucesso ou erro) — mesmo padrão de
  // `useApiQuery`: `isLoading` deriva da comparação em vez de `setState`
  // síncrono no corpo do efeito (proibido por `react-hooks/set-state-in-effect`).
  const [settledKey, setSettledKey] = useState<string | null>(null);
  // Geração da requisição em curso: toda resposta (1ª página ou loadMore) só é
  // aplicada se ainda for a mais recente — evita que um loadMore atrasado (ou
  // disparado 2x antes do 1º resolver) sobrescreva um refresh()/troca de url
  // mais novo, ou duplique a página anexada.
  const requestIdRef = useRef(0);

  const pageUrl = useCallback(
    (cursor: string | null) => {
      const separator = baseUrl.includes('?') ? '&' : '?';
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      return `${baseUrl}${separator}limit=${pageSize}${cursorParam}`;
    },
    [baseUrl, pageSize],
  );
  const requestKey = `${baseUrl}:${version}`;
  const isLoading = settledKey !== requestKey;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    apiFetchPage<T>(pageUrl(null))
      .then((page) => {
        if (requestIdRef.current === requestId) {
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setError(null);
          setSettledKey(requestKey);
        }
      })
      .catch((err: unknown) => {
        if (requestIdRef.current === requestId) {
          setError(
            err instanceof Error ? err.message : 'Erro ao carregar dados',
          );
          setSettledKey(requestKey);
        }
      });
  }, [pageUrl, requestKey]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  const loadMore = useCallback(() => {
    if (!nextCursor) return;
    const requestId = ++requestIdRef.current;
    apiFetchPage<T>(pageUrl(nextCursor))
      .then((page) => {
        if (requestIdRef.current !== requestId) return;
        // `nextCursor` só existe depois da 1ª página: `latest` nunca é nulo aqui.
        setItems((latest) => [...(latest as T[]), ...page.items]);
        setNextCursor(page.nextCursor);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      });
  }, [nextCursor, pageUrl]);

  return {
    items,
    hasMore: nextCursor !== null,
    error,
    isLoading,
    refresh,
    loadMore,
  };
}
