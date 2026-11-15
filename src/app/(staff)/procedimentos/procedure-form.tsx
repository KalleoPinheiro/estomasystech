'use client';

import { Button, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import { unwrapAction } from '@/lib/action-result';
import type { ProcedureDto } from '@/lib/dto';
import { createProcedure, updateProcedure } from './procedure-actions';

export function ProcedureForm({
  initial,
  onSaved,
}: {
  initial?: ProcedureDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(
    initial ? String(initial.priceCents / 100) : '',
  );
  const [duration, setDuration] = useState(
    initial ? String(initial.durationMinutes) : '60',
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        priceCents: Math.round(Number(price) * 100),
        durationMinutes: Number(duration),
      };
      await unwrapAction(
        initial
          ? updateProcedure({ id: initial.id, ...payload })
          : createProcedure(payload),
      );
      toast({
        description: 'Procedimento salvo',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao salvar procedimento',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <label className="font-medium text-sm">
        Nome *
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Troca de bolsa de colostomia"
          className="mt-1"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Preço *
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-ink-3 text-sm">R$</span>
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="flex-1"
            />
          </div>
        </label>
        <label className="font-medium text-sm">
          Duração (min) *
          <Input
            required
            type="number"
            min="1"
            max="480"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1"
          />
        </label>
      </div>
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </SafeForm>
  );
}
