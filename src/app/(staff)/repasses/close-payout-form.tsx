'use client';

import { Button, Input, NativeSelect, Textarea } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import type { PayoutStatementDto } from '@/lib/dto';
import { formatCurrency, monthLabelPtBr } from '@/lib/format';
import { PayoutItemsTable } from './payout-tables';

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Confirma o fechamento do mês de um profissional: congela e registra o pagamento. */
export function ClosePayoutForm({
  row,
  period,
  onSaved,
}: {
  row: PayoutStatementDto;
  period: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [paidAt, setPaidAt] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/commission-payouts', {
        method: 'POST',
        body: JSON.stringify({
          professionalId: row.professionalId,
          period,
          paidAt,
          paymentMethod,
          notes: notes || null,
        }),
      });
      toast({ description: 'Repasse registrado', variant: 'success' });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao registrar repasse',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <p className="text-sm">
        Fechamento de <strong>{monthLabelPtBr(period)}</strong> para{' '}
        <strong>{row.professionalName}</strong>:{' '}
        <strong>{formatCurrency(row.payableCents)}</strong> em{' '}
        {row.payable.length} itens. Inclui sessões liberadas de meses anteriores
        ainda não pagas; as sessões ficam registradas e não podem ser pagas de
        novo.
      </p>
      <PayoutItemsTable items={row.payable} />
      <label className="font-medium text-sm">
        Data do pagamento
        <Input
          type="date"
          required
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Forma de pagamento
        <NativeSelect
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="mt-1"
        >
          <option value="pix">Pix</option>
          <option value="transfer">Transferência</option>
          <option value="cash">Dinheiro</option>
        </NativeSelect>
      </label>
      <label className="font-medium text-sm">
        Observações
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          className="mt-1"
        />
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Registrando…' : 'Confirmar repasse'}
      </Button>
    </form>
  );
}
