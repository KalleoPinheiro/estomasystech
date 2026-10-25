'use client';

import { Button, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { unwrapAction } from '@/lib/action-result';
import type { CommissionPayoutDto } from '@/lib/dto';
import { formatCurrency, monthLabelPtBr } from '@/lib/format';
import { cancelPayout } from './payout-actions';

/** Cancela um repasse registrado por engano — motivo obrigatório, auditado. */
export function CancelPayoutForm({
  payout,
  onDone,
}: {
  payout: CommissionPayoutDto;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(cancelPayout({ id: payout.id, reason }));
      toast({ description: 'Repasse cancelado', variant: 'success' });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar repasse');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <p className="text-sm">
        Cancelar o repasse de <strong>{monthLabelPtBr(payout.period)}</strong>{' '}
        de <strong>{payout.professionalName}</strong> (
        {formatCurrency(payout.totalCents)})? As {payout.items.length} sessões
        voltam ao saldo a pagar e o mês pode ser fechado de novo. O registro
        fica no histórico como cancelado.
      </p>
      <p className="text-ink-2 text-sm">
        O sistema não movimenta dinheiro: se o valor já foi transferido, a
        devolução ou compensação é combinada diretamente com o profissional.
      </p>
      <label className="font-medium text-sm">
        Motivo do cancelamento *
        <Textarea
          required
          minLength={5}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: valor registrado errado"
          className="mt-1"
        />
      </label>
      <Button
        type="submit"
        disabled={saving}
        variant="destructive"
        className="mt-1"
      >
        {saving ? 'Cancelando…' : 'Confirmar cancelamento'}
      </Button>
    </form>
  );
}
