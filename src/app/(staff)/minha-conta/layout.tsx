import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { prefetchSettings } from '@/lib/server/data/settings-prefetch';
import { requireStaffPageFor } from '@/lib/server/session';
import { staffMetadata } from '@/lib/staff-metadata';

export const metadata = staffMetadata('Minha conta');

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireStaffPageFor('/minha-conta');
  // Conta, segundo fator e foto chegam no HTML (#557): sem `/api/me` na carga.
  const entries = await prefetchSettings(session, 'minha-conta');
  return <PrefetchedQueries entries={entries}>{children}</PrefetchedQueries>;
}
