'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import type { CommissionType } from '@/domain/professional/professional';
import { unwrapAction } from '@/lib/action-result';
import type { ProfessionalDto } from '@/lib/dto';
import { createProfessional, updateProfessional } from './professional-actions';

export function ProfessionalForm({
  initial,
  onSaved,
}: {
  initial?: ProfessionalDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [registry, setRegistry] = useState(initial?.registry ?? '');
  const [commissionType, setCommissionType] = useState<CommissionType>(
    initial?.commissionType ?? 'percentage',
  );
  const [commissionPct, setCommissionPct] = useState(
    initial?.commissionPct != null ? String(initial.commissionPct) : '',
  );
  const [commissionFixed, setCommissionFixed] = useState(
    initial?.commissionFixedCents != null
      ? String(initial.commissionFixedCents / 100)
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fullName,
        registry: registry || null,
        commissionType,
        commissionPct: commissionPct ? Number(commissionPct) : null,
        commissionFixedCents: commissionFixed
          ? Math.round(Number(commissionFixed) * 100)
          : null,
      };
      await unwrapAction(
        initial
          ? updateProfessional({ id: initial.id, ...payload })
          : createProfessional(payload),
      );
      toast({
        description: 'Profissional salvo',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar profissional',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Nome *
        <Input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Registro profissional
        <Input
          value={registry}
          onChange={(e) => setRegistry(e.target.value)}
          placeholder="Ex.: COREN-SP 123456"
          className="mt-1"
        />
        <span className="mt-1 block font-normal text-ink-3 text-xs">
          Ex.: COREN-SP 123456
        </span>
      </label>
      <label className="font-medium text-sm">
        Tipo de repasse
        <NativeSelect
          value={commissionType}
          onChange={(e) => setCommissionType(e.target.value as CommissionType)}
          className="mt-1"
        >
          <option value="percentage">Percentual da sessão</option>
          <option value="fixed">Valor fixo por sessão</option>
        </NativeSelect>
      </label>
      {commissionType === 'percentage' ? (
        <label className="font-medium text-sm">
          Repasse (%)
          <Input
            type="number"
            min="0"
            max="100"
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
            placeholder="Ex.: 15"
            className="mt-1"
          />
          <span className="mt-1 block font-normal text-ink-3 text-xs">
            Percentual sobre o valor de cada sessão realizada (sessão de pacote
            vale o preço do pacote dividido pelas sessões).
          </span>
        </label>
      ) : (
        <label className="font-medium text-sm">
          Valor por sessão (R$)
          <Input
            type="number"
            min="0"
            step="0.01"
            required
            value={commissionFixed}
            onChange={(e) => setCommissionFixed(e.target.value)}
            placeholder="Ex.: 50,00"
            className="mt-1"
          />
          <span className="mt-1 block font-normal text-ink-3 text-xs">
            Valor fixo repassado por sessão realizada, qualquer que seja o
            preço.
          </span>
        </label>
      )}
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  );
}
