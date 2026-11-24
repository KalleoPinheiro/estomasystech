'use client';

import { Button, Checkbox, Input, NativeSelect } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import {
  parseSupplyCategory,
  SUPPLY_CATEGORIES,
  SUPPLY_CATEGORY_LABELS,
  type SupplyCategory,
} from '@/domain/inventory/supply';
import { unwrapAction } from '@/lib/action-result';
import type { SupplyDto } from '@/lib/dto';
import { createSupply, updateSupply } from './supply-actions';

interface SupplyFormValues {
  name: string;
  unit: string;
  minQty: string;
  price: string;
  /** '' = sem categoria. */
  category: string;
  active: boolean;
}

const toSupplyFormValues = (initial?: SupplyDto): SupplyFormValues => ({
  name: initial?.name ?? '',
  unit: initial?.unit ?? 'un',
  minQty: initial ? String(initial.minQty) : '0',
  price: initial ? String(initial.priceCents / 100) : '',
  category: initial?.category ?? '',
  active: initial?.active ?? true,
});

/** Só envia a categoria quando ela muda: cadastro sem categoria e edição que não a toca ficam como antes. */
const categoryChange = (
  values: SupplyFormValues,
  baseline: SupplyCategory | null,
): { category?: SupplyCategory | null } => {
  const category = parseSupplyCategory(values.category);
  return category === baseline ? {} : { category };
};

const saveSupply = async (
  values: SupplyFormValues,
  initial: SupplyDto | undefined,
  baselineCategory: SupplyCategory | null,
): Promise<void> => {
  const payload = {
    name: values.name,
    unit: values.unit,
    minQty: Number(values.minQty),
    priceCents: Math.round(Number(values.price) * 100),
    ...categoryChange(values, baselineCategory),
  };
  if (initial) {
    await unwrapAction(
      updateSupply({ id: initial.id, ...payload, active: values.active }),
    );
    return;
  }
  await unwrapAction(createSupply(payload));
};

export function SupplyForm({
  initial,
  onSaved,
}: {
  initial?: SupplyDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [values, setValues] = useState<SupplyFormValues>(() =>
    toSupplyFormValues(initial),
  );
  // A categoria de quando o formulário abriu: um refresh no meio da edição não muda a comparação.
  const [baselineCategory] = useState<SupplyCategory | null>(
    () => initial?.category ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveSupply(values, initial, baselineCategory);
      toast({
        description: 'Insumo salvo',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar insumo');
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
          value={values.name}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="Ex.: Bolsa colostomia 1 peça 60mm"
          className="mt-1"
        />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="font-medium text-sm">
          Unidade *
          <Input
            required
            value={values.unit}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, unit: e.target.value }))
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Estoque mínimo *
          <Input
            required
            type="number"
            min="0"
            value={values.minQty}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, minQty: e.target.value }))
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Preço *
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-ink-3 text-sm">R$</span>
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, price: e.target.value }))
              }
              className="flex-1"
            />
          </div>
        </label>
      </div>
      <label className="font-medium text-sm">
        Categoria
        <NativeSelect
          value={values.category}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, category: e.target.value }))
          }
          className="mt-1"
        >
          <option value="">Sem categoria</option>
          {SUPPLY_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {SUPPLY_CATEGORY_LABELS[category]}
            </option>
          ))}
        </NativeSelect>
      </label>
      {initial && (
        <label className="flex items-center gap-2 font-medium text-sm">
          <Checkbox
            checked={values.active}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, active: e.target.checked }))
            }
          />
          Insumo ativo
        </label>
      )}
      <Button type="submit" disabled={saving} variant="accent" className="mt-1">
        {saving ? 'Salvando…' : 'Salvar'}
      </Button>
    </SafeForm>
  );
}
