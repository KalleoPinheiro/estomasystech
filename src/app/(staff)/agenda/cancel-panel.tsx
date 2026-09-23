'use client';

import { Button, Checkbox, NativeSelect, Textarea } from '@still-void/ui/react';
import { useState } from 'react';
import type { CancellationOrigin } from '@/domain/scheduling/appointment';
import {
  type CancellationPolicy,
  isLateChange,
} from '@/domain/scheduling/schedule-config';
import { formatCurrency } from '@/lib/format';

export interface CancelRequest {
  requestedBy: CancellationOrigin;
  reason: string | null;
  chargeLateFee: boolean;
}

/**
 * Cancelamento pela equipe: quem pediu, motivo e — quando o paciente pede
 * dentro da antecedência mínima da clínica e há taxa — se cobra a taxa.
 */
export function CancelPanel({
  startsAt,
  policy,
  busy,
  onConfirm,
}: {
  startsAt: string;
  policy: CancellationPolicy;
  busy: boolean;
  onConfirm: (request: CancelRequest) => void;
}) {
  const [requestedBy, setRequestedBy] = useState<CancellationOrigin>('clinic');
  const [reason, setReason] = useState('');
  const [chargeLateFee, setChargeLateFee] = useState(true);
  // Relógio lido uma vez na montagem (não em render).
  const [late] = useState(() =>
    isLateChange(new Date(startsAt), new Date(), policy),
  );
  const patientLate = requestedBy === 'patient' && late;
  const feeApplies = patientLate && policy.lateFeeCents > 0;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
      <label className="font-medium text-xs">
        Quem pediu o cancelamento?
        <NativeSelect
          value={requestedBy}
          onChange={(e) => setRequestedBy(e.target.value as CancellationOrigin)}
          className="mt-1"
        >
          <option value="clinic">Clínica</option>
          <option value="patient">Paciente (telefone, presencial…)</option>
        </NativeSelect>
      </label>
      <label className="font-medium text-xs">
        Motivo (opcional)
        <Textarea
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1"
        />
      </label>
      {patientLate && (
        <p className="text-warning text-xs">
          Cancelamento tardio: menos de {policy.noticeHours}h de antecedência.
        </p>
      )}
      {feeApplies && (
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={chargeLateFee}
            onChange={(e) => setChargeLateFee(e.target.checked)}
          />
          Cobrar taxa de {formatCurrency(policy.lateFeeCents)}
        </label>
      )}
      <Button
        type="button"
        variant="destructive"
        disabled={busy}
        onClick={() =>
          onConfirm({
            requestedBy,
            reason: reason.trim() || null,
            chargeLateFee: feeApplies && chargeLateFee,
          })
        }
      >
        Confirmar cancelamento
      </Button>
    </div>
  );
}

/** Falta com taxa configurada: a equipe decide se cobra. */
export function NoShowPanel({
  policy,
  busy,
  onConfirm,
}: {
  policy: CancellationPolicy;
  busy: boolean;
  onConfirm: (chargeLateFee: boolean) => void;
}) {
  const [chargeLateFee, setChargeLateFee] = useState(true);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={chargeLateFee}
          onChange={(e) => setChargeLateFee(e.target.checked)}
        />
        Cobrar taxa de não comparecimento de{' '}
        {formatCurrency(policy.lateFeeCents)}
      </label>
      <Button
        type="button"
        variant="accent"
        disabled={busy}
        onClick={() => onConfirm(chargeLateFee)}
      >
        Confirmar falta
      </Button>
    </div>
  );
}
