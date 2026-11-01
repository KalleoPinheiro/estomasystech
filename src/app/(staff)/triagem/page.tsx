import { Card } from '@still-void/ui/react';
import { TriageActions } from '@/app/(staff)/_hoje/triage-actions';
import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { loadBlock } from '@/lib/server/data/load-block';
import { buildLinkedTriageQueue } from '@/lib/server/data/triage';
import { requireStaffPageFor } from '@/lib/server/session';

/**
 * Lista completa da fila de triagem (issue #135) no servidor (#549, ADR-069):
 * a fila chega no HTML, sem chamada `/api` na carga. O resumo da tela Hoje
 * capa em 8 e linka pra cá; os dois usam a mesma leitura (`buildLinkedTriageQueue`,
 * escopo R4 do papel) e a mesma Server Action de decisão (`TriageActions`).
 */
export default async function TriagePage() {
  const session = await requireStaffPageFor('/triagem');
  const loaded = await loadBlock(() => buildLinkedTriageQueue(session));

  return (
    <div>
      <PageHeader title="Triagem de fotos" />
      <Card className="p-5">
        {loaded.error !== null ? (
          <RefreshErrorAlert message={loaded.error} />
        ) : loaded.data.length === 0 ? (
          <EmptyState
            message="Nenhuma foto aguardando triagem."
            icon="check-circle"
          />
        ) : (
          <TriageActions queue={loaded.data} />
        )}
      </Card>
    </div>
  );
}
