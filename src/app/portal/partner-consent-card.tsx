'use client';

import { Button, Card, Prose } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import type { PartnerShareConsentDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

const ENDPOINT = '/api/portal/patient/partner-consent';

function statusLine(consent: PartnerShareConsentDto): string {
  if (consent.active && consent.acceptedAt) {
    return `Autorizado em ${formatDateTime(consent.acceptedAt)}.`;
  }
  if (consent.revoked && consent.revokedAt) {
    return `Autorização revogada em ${formatDateTime(consent.revokedAt)}.`;
  }
  return 'Você ainda não autorizou.';
}

/**
 * Consentimento para o médico que indicou o paciente ver condições e
 * avaliações no portal do parceiro (#292). Opcional: sem ele, o médico vê só
 * que o paciente foi atendido. Não aparece para quem não foi indicado.
 */
export function PartnerConsentSection() {
  const { toast } = useToast();
  const { data: consent, refresh } = useApiQuery<PartnerShareConsentDto | null>(
    ENDPOINT,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!consent) return null;

  const run = async (path: string, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, { method: 'POST' });
      toast({ description: success, variant: 'success' });
      refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao registrar sua escolha';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-partner-consent={consent.active ? 'active' : 'inactive'}>
      <h2 className="mb-3 font-semibold text-lg">
        Compartilhar com {consent.partnerName}
      </h2>
      <Card className="flex flex-col gap-3 p-4">
        {error && <ErrorAlert message={error} />}
        <p className="text-ink-2 text-sm">{statusLine(consent)}</p>
        {consent.active ? (
          <ConfirmAction
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                className="self-start"
              >
                {busy ? 'Revogando…' : 'Revogar autorização'}
              </Button>
            }
            title="Revogar autorização"
            description={`${consent.partnerName} deixa de ver sua evolução clínica e passa a ver só que você foi atendido(a). Confirma?`}
            confirmLabel="Revogar"
            variant="danger"
            onConfirm={() =>
              void run(`${ENDPOINT}/revoke`, 'Autorização revogada')
            }
          />
        ) : (
          <>
            <Prose className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-sv-surface p-3 text-sm">
              {consent.consentText}
            </Prose>
            <Button
              type="button"
              variant="accent"
              disabled={busy}
              className="self-start"
              onClick={() => void run(ENDPOINT, 'Autorização registrada')}
            >
              {busy ? 'Registrando…' : 'Li e autorizo'}
            </Button>
          </>
        )}
      </Card>
    </section>
  );
}
