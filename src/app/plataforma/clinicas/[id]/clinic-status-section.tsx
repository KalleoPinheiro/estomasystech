'use client';

import { Button, Card, NativeSelect, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { Modal } from '@/components/modal';
import {
  CLINIC_SUSPENSION_NOTE_MAX,
  CLINIC_SUSPENSION_REASONS,
  type ClinicSuspensionReason,
} from '@/domain/clinic/clinic';
import { apiFetch } from '@/lib/client';
import { CLINIC_SUSPENSION_REASON_LABELS } from '@/lib/clinic-suspension-labels';
import type { PlatformClinicDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';

type StatusAction = 'suspend' | 'reactivate';

interface SuspendBody {
  reason: ClinicSuspensionReason;
  note: string | null;
}

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

  const change = async (action: StatusAction, body?: SuspendBody) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/platform/clinics/${clinic.id}/${action}`, {
        method: 'POST',
        ...(body && { body: JSON.stringify(body) }),
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
        <ActiveStatus
          busy={busy}
          onSuspend={(body) => void change('suspend', body)}
        />
      )}
    </Card>
  );
}

function ActiveStatus({
  busy,
  onSuspend,
}: {
  busy: boolean;
  onSuspend: (body: SuspendBody) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-ink-3 text-sm">Clínica ativa.</p>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Suspender clínica
      </Button>
      {open && (
        <Modal title="Suspender clínica?" onClose={() => setOpen(false)}>
          <SuspendForm
            onCancel={() => setOpen(false)}
            onConfirm={(body) => {
              setOpen(false);
              onSuspend(body);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * Confirmação da suspensão (#251): o motivo é obrigatório, da lista fechada, e
 * a observação é opcional. O motivo fica só na plataforma — a clínica recebe o
 * aviso sem ele.
 */
function SuspendForm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (body: SuspendBody) => void;
}) {
  const [reason, setReason] = useState<ClinicSuspensionReason | ''>('');
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-3 text-sm">
        Todas as contas da clínica — equipe, pacientes e parceiros — perdem o
        acesso em até 1 minuto e os lembretes param. Nenhum dado é apagado. Os
        admins da clínica recebem um aviso por e-mail, sem o motivo.
      </p>
      <label className="font-medium text-sm">
        Motivo
        <NativeSelect
          value={reason}
          onChange={(e) => setReason(e.target.value as ClinicSuspensionReason)}
          className="mt-1"
        >
          <option value="" disabled>
            Selecione o motivo
          </option>
          {CLINIC_SUSPENSION_REASONS.map((code) => (
            <option key={code} value={code}>
              {CLINIC_SUSPENSION_REASON_LABELS[code]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="font-medium text-sm">
        Observação (opcional)
        <Textarea
          maxLength={CLINIC_SUSPENSION_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={reason === ''}
          onClick={() => {
            if (reason !== '') {
              onConfirm({ reason, note: note.trim() || null });
            }
          }}
        >
          Suspender
        </Button>
      </div>
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
      <SuspensionReason clinic={clinic} />
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

/** Motivo vigente (#251); suspensões anteriores à #251 não têm motivo. */
function SuspensionReason({ clinic }: { clinic: PlatformClinicDto }) {
  if (!clinic.statusReason) {
    return <p className="text-ink-3 text-sm">Motivo não registrado.</p>;
  }
  return (
    <div className="text-sm">
      <p>
        <span className="text-ink-3">Motivo: </span>
        {CLINIC_SUSPENSION_REASON_LABELS[clinic.statusReason]}
      </p>
      {clinic.statusReasonNote && (
        <p className="whitespace-pre-line text-ink-3">
          {clinic.statusReasonNote}
        </p>
      )}
    </div>
  );
}
