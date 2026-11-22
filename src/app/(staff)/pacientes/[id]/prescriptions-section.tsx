'use client';

import { Button, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import type { PrescriptionSummaryDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

/** Mesmo limite do domínio (`PRESCRIPTION_FREE_TEXT_MAX`), sem puxar o domínio para o cliente. */
const FREE_TEXT_MAX = 2000;

const downloadUrl = (planId: string, prescriptionId: string) =>
  `/api/care-plans/${planId}/receituarios/${prescriptionId}`;

/**
 * Receituário de enfermagem (#956, ADR-116): emitir grava o que vai impresso
 * (intervenções do plano e observações) com o número `RCT-`. Cada emitido baixa
 * sempre igual; se o plano mudar, emite-se outro.
 */
export function PrescriptionsSection({ planId }: { planId: string }) {
  const { toast } = useToast();
  const {
    data: issued,
    error: listError,
    refresh,
  } = useApiQuery<PrescriptionSummaryDto[]>(
    `/api/care-plans/${planId}/receituarios`,
  );
  const [freeText, setFreeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issue = async () => {
    setSaving(true);
    setError(null);
    const submitted = freeText;
    try {
      const prescription = await apiFetch<PrescriptionSummaryDto>(
        `/api/care-plans/${planId}/receituarios`,
        {
          method: 'POST',
          body: JSON.stringify({ freeText: submitted.trim() || null }),
        },
      );
      // O que foi digitado durante o envio não foi emitido: fica no campo.
      setFreeText((current) => (current === submitted ? '' : current));
      refresh();
      toast({
        description: `Receituário ${prescription.documentNumber} emitido`,
        variant: 'success',
      });
      // Baixa na mesma aba: o PDF vem como anexo, a página fica onde está.
      window.open(downloadUrl(planId, prescription.id), '_self');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao emitir o receituário',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby={`receituario-${planId}`}
      className="flex flex-col gap-2"
    >
      <h4 id={`receituario-${planId}`} className="font-medium text-sm">
        Receituário
      </h4>
      {error && <ErrorAlert message={error} />}
      <label
        htmlFor={`receituario-obs-${planId}`}
        className="text-ink-3 text-sm"
      >
        Observações (opcional)
      </label>
      <Textarea
        id={`receituario-obs-${planId}`}
        value={freeText}
        maxLength={FREE_TEXT_MAX}
        rows={3}
        onChange={(event) => setFreeText(event.target.value)}
      />
      <Button
        type="button"
        className="self-start"
        disabled={saving}
        onClick={issue}
      >
        {saving ? 'Emitindo…' : 'Emitir receituário (PDF)'}
      </Button>
      {listError && <ErrorAlert message={listError} onRetry={refresh} />}
      {issued && issued.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {issued.map((prescription) => (
            <li key={prescription.id}>
              <a
                href={downloadUrl(planId, prescription.id)}
                download
                className="font-medium text-accent-ink hover:underline"
              >
                {prescription.documentNumber}
              </a>{' '}
              <span className="text-ink-3">
                emitido em {formatDateTime(prescription.issuedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
