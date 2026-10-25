import { Icon } from '@still-void/ui/react';
import { SummaryCard } from '@/components/summary-card';
import type { Session } from '@/lib/auth/session';
import { buildLinkedTriageQueue } from '@/lib/server/data/triage';
import { loadBlock } from './load-block';
import { TriageActions } from './triage-actions';

// Mesmo cap das outras cards do dashboard (FollowUpsCard/LowStockCard) —
// resto da fila fica em /triagem (issue #135).
const TRIAGE_QUEUE_CAP = 8;

/** Resumo da fila de triagem (O4.2) no dashboard; lista completa em `/triagem`. */
export async function TriageCard({ session }: { session: Session }) {
  const { data: queue, error } = await loadBlock(() =>
    buildLinkedTriageQueue(session),
  );

  return (
    <SummaryCard
      title={
        <>
          <Icon name="camera" /> Fotos de pacientes aguardando triagem (
          {queue?.length ?? 0})
        </>
      }
      titleClassName="font-bold text-sm text-warning"
      titleTag="h3"
      headerClassName="mb-2 flex items-center justify-between"
      href={{
        label: 'Ver todas as fotos',
        url: '/triagem',
        className:
          'inline-flex items-center gap-1 whitespace-nowrap font-medium text-sm text-warning hover:underline',
      }}
      cardClassName="mb-6 border-warning bg-warning-soft p-4"
      error={error}
      isEmpty={!queue || queue.length === 0}
      hideWhenEmpty
    >
      <TriageActions queue={(queue ?? []).slice(0, TRIAGE_QUEUE_CAP)} />
    </SummaryCard>
  );
}
