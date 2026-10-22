'use client';

import { Button, Checkbox, Input } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { normalizeCpf } from '@/domain/shared/cpf';
import type { InvoiceDto } from '@/lib/dto';
import { formatCurrency, PAYMENT_METHOD_LABELS } from '@/lib/format';

export interface PayerValues {
  name: string;
  cpf: string;
}

const toReais = (cents: number) => (cents / 100).toFixed(2);
const toCents = (reais: string) => Math.round(Number(reais) * 100);

/**
 * Recebimento: valor (padrão = saldo) e forma. Receber menos que o saldo é
 * pagamento parcial — a fatura continua pendente pelo restante.
 */
export function PaymentForm({
  invoice,
  onPay,
}: {
  invoice: InvoiceDto;
  onPay: (
    amountCents: number,
    method: string,
    payer: PayerValues | null,
  ) => Promise<void>;
}) {
  const [amount, setAmount] = useState(toReais(invoice.balanceCents));
  const [busy, setBusy] = useState(false);
  const [otherPayer, setOtherPayer] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [payerCpf, setPayerCpf] = useState('');
  const [payerError, setPayerError] = useState<string | null>(null);
  const cents = toCents(amount);
  const partial = cents > 0 && cents < invoice.balanceCents;
  const overBalance = cents > invoice.balanceCents;
  const invalidAmount = !(cents > 0) || overBalance;

  const pay = async (method: string) => {
    const payer = otherPayer ? { name: payerName, cpf: payerCpf } : null;
    if (payer) {
      try {
        normalizeCpf(payer.cpf);
      } catch (err) {
        setPayerError(err instanceof Error ? err.message : 'CPF inválido');
        return;
      }
    }
    setPayerError(null);
    setBusy(true);
    try {
      await onPay(cents, method, payer);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 text-sm">
        {invoice.patientName} — saldo de{' '}
        <strong>{formatCurrency(invoice.balanceCents)}</strong>
        {invoice.paidCents > 0 &&
          ` (já recebido ${formatCurrency(invoice.paidCents)})`}
      </p>
      <label className="font-medium text-sm">
        Valor recebido (R$)
        <Input
          type="number"
          min="0.01"
          step="0.01"
          max={toReais(invoice.balanceCents)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1"
        />
      </label>
      {overBalance && (
        <p role="alert" className="text-danger text-xs">
          Valor maior que o saldo: o máximo é{' '}
          {formatCurrency(invoice.balanceCents)}.
        </p>
      )}
      {partial && (
        <p className="text-warning text-xs">
          Pagamento parcial: fica faltando{' '}
          {formatCurrency(invoice.balanceCents - cents)}.
        </p>
      )}
      <label className="flex items-center gap-2 font-medium text-sm">
        <Checkbox
          checked={otherPayer}
          onChange={(e) => setOtherPayer(e.target.checked)}
        />
        Quem pagou não é o paciente
      </label>
      {otherPayer && (
        <>
          {payerError && <ErrorAlert message={payerError} />}
          <label className="font-medium text-sm">
            Nome do pagador *
            <Input
              required
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="font-medium text-sm">
            CPF do pagador *
            <Input
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={payerCpf}
              onChange={(e) => setPayerCpf(e.target.value)}
              className="mt-1"
            />
          </label>
          <p className="text-ink-3 text-xs">
            O recibo sai no nome do pagador, para ele usar no IRPF.
          </p>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(PAYMENT_METHOD_LABELS).map(([method, label]) => (
          <Button
            key={method}
            type="button"
            disabled={busy || invalidAmount}
            onClick={() => void pay(method)}
            variant="outline"
            className="hover:bg-accent-soft"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Desconto com motivo (substitui o anterior; zero remove). */
export function DiscountForm({
  invoice,
  onSave,
}: {
  invoice: InvoiceDto;
  onSave: (amountCents: number, reason: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(toReais(invoice.discountCents));
  const [reason, setReason] = useState(invoice.discountReason ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cents = toCents(amount);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(cents, reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar desconto');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <p className="text-ink-2 text-sm">
        {invoice.patientName} — fatura de {formatCurrency(invoice.amountCents)}
      </p>
      <label className="font-medium text-sm">
        Desconto (R$)
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Motivo *
        <Input
          required
          maxLength={200}
          placeholder="Ex.: fidelidade, cortesia parcial"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1"
        />
      </label>
      <p className="text-ink-3 text-xs">
        Valor a cobrar:{' '}
        {formatCurrency(Math.max(invoice.amountCents - cents, 0))}
      </p>
      <Button type="submit" variant="accent" disabled={saving}>
        {saving ? 'Salvando…' : 'Aplicar desconto'}
      </Button>
    </form>
  );
}
