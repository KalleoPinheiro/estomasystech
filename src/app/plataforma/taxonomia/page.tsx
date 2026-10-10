'use client';

import { Button, Card } from '@still-void/ui/react';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/client';

/** Contagens devolvidas por `POST /api/platform/taxonomy/import`. */
interface ImportCounts {
  diagnoses: number;
  outcomes: number;
  interventions: number;
  linkages: number;
}

const COUNT_LABELS: { key: keyof ImportCounts; label: string }[] = [
  { key: 'diagnoses', label: 'Diagnósticos' },
  { key: 'outcomes', label: 'Resultados' },
  { key: 'interventions', label: 'Intervenções' },
  { key: 'linkages', label: 'Ligações' },
];

/**
 * Importação do catálogo curado de estomaterapia (C4, #267) sobre a API que já
 * existia. O catálogo é global, então é ato de plataforma; o licenciado
 * completo continua só por script.
 */
export default function PlatformTaxonomyPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<ImportCounts | null>(null);

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      setCounts(
        await apiFetch<ImportCounts>('/api/platform/taxonomy/import', {
          method: 'POST',
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Taxonomia" />
      <Card as="section" className="flex flex-col gap-4 p-5">
        <p className="text-ink-2 text-sm">
          Importa o catálogo curado de estomaterapia (NANDA-I, NOC, NIC e
          ligações). Pode ser repetido: itens existentes não são duplicados. O
          catálogo licenciado completo é importado por{' '}
          <code>scripts/import-taxonomy.ts</code>.
        </p>
        {error && <ErrorAlert message={error} />}
        <div>
          <ConfirmAction
            trigger={
              <Button type="button" disabled={busy}>
                Importar catálogo de estomaterapia
              </Button>
            }
            title="Importar o catálogo de estomaterapia para todas as clínicas?"
            description="Itens que já existem no catálogo não são duplicados."
            confirmLabel="Importar"
            onConfirm={() => void runImport()}
          />
        </div>
        {busy && <LoadingIndicator />}
        {counts && !busy && <ImportResult counts={counts} />}
      </Card>
    </>
  );
}

function ImportResult({ counts }: { counts: ImportCounts }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium text-sm">Importados nesta execução:</p>
      <ul className="text-ink-2 text-sm">
        {COUNT_LABELS.map(({ key, label }) => (
          <li key={key}>
            {label}: {counts[key]}
          </li>
        ))}
      </ul>
    </div>
  );
}
