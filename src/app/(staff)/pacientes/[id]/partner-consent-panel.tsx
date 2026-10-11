'use client';

import { Button, Card } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { PartnerShareConsentDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

const REVOKED_BY = { patient: 'pelo paciente', staff: 'pela equipe' };

function describe(consent: PartnerShareConsentDto): string {
  if (consent.active && consent.acceptedAt) {
    return `Autorizado pelo paciente em ${formatDateTime(consent.acceptedAt)} (texto ${consent.acceptedVersion ?? '—'}).`;
  }
  if (consent.revoked && consent.revokedAt) {
    const by = consent.revokedBy ? ` ${REVOKED_BY[consent.revokedBy]}` : '';
    return `Revogado${by} em ${formatDateTime(consent.revokedAt)}.`;
  }
  if (consent.acceptedAt) {
    return 'O texto do consentimento mudou: o paciente precisa autorizar de novo pelo portal.';
  }
  return 'O paciente não autorizou. O parceiro vê só se ele foi atendido.';
}

/**
 * Consentimento do paciente para o parceiro indicador ver a evolução clínica
 * no portal (#292). A equipe só revoga (ex.: pedido na recepção); autorizar é
 * sempre do paciente, pelo portal. Sem parceiro indicador, não aparece.
 */
export function PartnerConsentPanel({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  const endpoint = `/api/patients/${patientId}/partner-consent`;
  const { data: consent, refresh } = useApiQuery<PartnerShareConsentDto | null>(
    endpoint,
  );
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  if (!consent) return null;

  const revoke = async () => {
    setRevoking(true);
    setError(null);
    try {
      await apiFetch(`${endpoint}/revoke`, { method: 'POST' });
      toast({ description: 'Consentimento revogado', variant: 'success' });
      refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao revogar consentimento';
      setError(message);
      toast({ description: message, variant: 'danger' });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Card className="mb-6 flex flex-col gap-2 p-4" data-partner-consent-panel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">
          Compartilhamento com {consent.partnerName} (parceiro indicador)
        </h2>
        <StatusBadge
          status={consent.active ? 'completed' : 'cancelled'}
          label={consent.active ? 'Autorizado' : 'Não autorizado'}
        />
      </div>
      {error && <ErrorAlert message={error} />}
      <p className="text-ink-2 text-sm">{describe(consent)}</p>
      {consent.active && (
        <ConfirmAction
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revoking}
              className="self-start"
            >
              {revoking ? 'Revogando…' : 'Revogar a pedido do paciente'}
            </Button>
          }
          title="Revogar consentimento"
          description={`${consent.partnerName} deixa de ver condições e avaliações deste paciente. Só o paciente pode autorizar de novo, pelo portal. Confirma?`}
          confirmLabel="Revogar"
          variant="danger"
          onConfirm={() => void revoke()}
        />
      )}
    </Card>
  );
}
