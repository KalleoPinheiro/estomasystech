import type { ReactNode } from 'react';
import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { prefetchSettings } from '@/lib/server/data/settings-prefetch';
import { requireStaffPageFor } from '@/lib/server/session';

/**
 * Lê no servidor o que a seção consulta e entrega ao cliente já no HTML (#557):
 * sem cascata de `/api` ao abrir a seção e sem salto de layout depois da
 * hidratação. A guarda de papel da tela é a do `layout.tsx` pai; aqui só se
 * lê o que o papel da sessão pode usar.
 */
export async function SectionPrefetch({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  const session = await requireStaffPageFor('/configuracoes');
  const entries = await prefetchSettings(session, slug);
  return <PrefetchedQueries entries={entries}>{children}</PrefetchedQueries>;
}
