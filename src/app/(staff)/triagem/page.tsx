'use client';

import { Card } from '@still-void/ui/react';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { TriagePhotoList } from '@/components/triage-photo-list';
import { useTriageQueue } from '@/lib/use-triage-queue';

/**
 * Lista completa da fila de triagem (issue #135) — o resumo no dashboard
 * (`src/app/(staff)/page.tsx`) capa em 8 e linka pra cá. Mesmo hook e mesmo
 * componente de lista dos dois lugares; só a moldura da página muda.
 */
export default function TriagePage() {
  const {
    queue,
    queryError,
    isLoading,
    actionError,
    submittingId,
    refresh,
    triage,
  } = useTriageQueue();

  return (
    <div>
      <PageHeader title="Triagem de fotos" />
      <Card className="p-5">
        {isLoading ? (
          <LoadingIndicator />
        ) : queryError ? (
          <ErrorAlert message={queryError} onRetry={refresh} />
        ) : !queue || queue.length === 0 ? (
          <EmptyState
            message="Nenhuma foto aguardando triagem."
            icon="check-circle"
          />
        ) : (
          <TriagePhotoList
            queue={queue}
            actionError={actionError}
            submittingId={submittingId}
            onTriage={triage}
          />
        )}
      </Card>
    </div>
  );
}
