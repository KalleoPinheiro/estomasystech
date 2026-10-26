import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import type { Session } from '@/lib/auth/session';
import { loadBlock } from '@/lib/server/data/load-block';
import { listMajorityReviewsFor } from '@/lib/server/data/majority';
import { MajorityReviewCard } from '../majority-review-card';

/** Aviso de maioridade (#372) lido no servidor; some quando não há ninguém. */
export async function MajorityCard({ session }: { session: Session }) {
  const { data, error } = await loadBlock(() =>
    listMajorityReviewsFor(session),
  );
  if (error) return <RefreshErrorAlert message={error} />;
  if (!data || data.length === 0) return null;
  return <MajorityReviewCard initial={data} />;
}
