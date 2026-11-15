'use client';

import { createContext, type ReactNode, useContext } from 'react';

/**
 * Respostas que o servidor já leu para a tela (#557, ADR-074), por URL de API.
 * `useApiQuery` usa a da própria URL como primeiro valor e só vai à rede ao
 * atualizar: a seção chega no HTML, sem cascata de `/api` nem salto de layout
 * depois da hidratação. Sem provider (testes isolados, falha de leitura no
 * servidor) a consulta é a de sempre.
 */
const PrefetchedContext = createContext<Readonly<Record<string, unknown>>>({});

export function PrefetchedQueries({
  entries,
  children,
}: {
  entries: Readonly<Record<string, unknown>>;
  children: ReactNode;
}) {
  return (
    <PrefetchedContext.Provider value={entries}>
      {children}
    </PrefetchedContext.Provider>
  );
}

/** Resposta pré-lida da URL, ou `undefined` quando o servidor não a entregou. */
export function usePrefetched<T>(url: string | null): T | undefined {
  const entries = useContext(PrefetchedContext);
  return url !== null && Object.hasOwn(entries, url)
    ? (entries[url] as T)
    : undefined;
}
