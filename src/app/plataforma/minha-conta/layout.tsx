import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { prefetchSettings } from '@/lib/server/data/settings-prefetch';
import { requirePlatformPage } from '@/lib/server/session';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePlatformPage();
  // Conta, segundo fator e foto chegam no HTML (#558): sem `/api/me` na carga.
  const entries = await prefetchSettings(session, 'minha-conta');
  return <PrefetchedQueries entries={entries}>{children}</PrefetchedQueries>;
}
