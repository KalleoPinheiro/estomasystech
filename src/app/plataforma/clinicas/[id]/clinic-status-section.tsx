'use client';

import { Button, Card } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import type { PlatformClinicDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';

type StatusAction = 'suspend' | 'reactivate';

const ACTION_DONE: Record<StatusAction, string> = {
  suspend: 'Clínica suspensa',
  reactivate: 'Clínica reativada',
};

/**
 * Situação da clínica (B5, Journey 7 e 8). Suspender pede confirmação: derruba
 * o acesso de toda a clínica. Reativar só devolve o acesso que já existia.
 */
export function ClinicStatusSection({
  clinic,
  onChanged,
}: {
  clinic: PlatformClinicDto;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = async (action: StatusAction) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/platform/clinics/${clinic.id}/${action}`, {
        method: 'POST',
      });
      toast({ description: ACTION_DONE[action], variant: 'success' });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao mudar a situação');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Situação da clínica</h2>
      {error && <ErrorAlert message={error} />}
      {clinic.status === 'suspended' ? (
        <SuspendedStatus
          clinic={clinic}
          busy={busy}
          onReactivate={() => void change('reactivate')}
        />
      ) : (
        <ActiveStatus busy={busy} onSuspend={() => void change('suspend')} />
      )}
    </Card>
  );
}

function ActiveStatus({
  busy,
  onSuspend,
}: {
  busy: boolean;
  onSuspend: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-ink-3 text-sm">Clínica ativa.</p>
      <ConfirmAction
        trigger={
          <Button type="button" variant="outline" disabled={busy}>
            Suspender clínica
          </Button>
        }
        title="Suspender clínica?"
        description="Todas as contas da clínica — equipe, pacientes e parceiros — perdem o acesso em até 1 minuto e os lembretes param. Nenhum dado é apagado."
        confirmLabel="Suspender"
        variant="danger"
        onConfirm={onSuspend}
      />
    </div>
  );
}

function SuspendedStatus({
  clinic,
  busy,
  onReactivate,
}: {
  clinic: PlatformClinicDto;
  busy: boolean;
  onReactivate: () => void;
}) {
  const since = clinic.statusChangedAt
    ? formatDateTime(clinic.statusChangedAt)
    : '—';
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-ink-3 text-sm">
        Suspensa em {since} por {clinic.statusChangedBy ?? '—'}.
      </p>
      <Button
        type="button"
        variant="accent"
        disabled={busy}
        onClick={onReactivate}
      >
        Reativar clínica
      </Button>
    </div>
  );
}
