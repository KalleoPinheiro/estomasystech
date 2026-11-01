'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { unwrapAction } from '@/lib/action-result';
import type { ProcedureDto, SupplyDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { setProcedureKit } from './procedure-actions';

interface KitItemDraft {
  id: string;
  supplyId: string;
  quantity: string;
}

/** Kit padrão do procedimento: baixado automaticamente ao concluir a consulta. */
export function KitForm({
  procedure,
  supplies,
  onSaved,
}: {
  procedure: ProcedureDto;
  supplies: SupplyDto[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: kit } = useApiQuery<{
    items: Array<{ supplyId: string; quantity: number }>;
  }>(`/api/procedures/${procedure.id}/kit`);
  const [edits, setEdits] = useState<KitItemDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!kit) return <LoadingIndicator />;

  const items =
    edits ??
    kit.items.map((item) => ({
      id: crypto.randomUUID(),
      supplyId: item.supplyId,
      quantity: String(item.quantity),
    }));
  const activeSupplies = supplies.filter((s) => s.active);
  const supplyName = (id: string) =>
    supplies.find((s) => s.id === id)?.name ?? id;
  const filledItems = items.filter((item) => item.supplyId);
  const hasInvalidQuantity = filledItems.some(
    (item) => !(Number(item.quantity) > 0),
  );

  /** Opções de um `<select>` de linha excluem insumos já escolhidos em outras
   * linhas do mesmo kit (PROC-04) — o domínio já rejeita duplicata no save,
   * isso evita o usuário chegar lá pra descobrir. */
  const optionsFor = (rowIndex: number) =>
    activeSupplies.filter(
      (supply) =>
        supply.id === items[rowIndex].supplyId ||
        !items.some((item, i) => i !== rowIndex && item.supplyId === supply.id),
    );

  const save = async () => {
    if (hasInvalidQuantity) {
      setError(
        'Quantidade deve ser um número inteiro maior que zero em todos os itens',
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        setProcedureKit({
          procedureId: procedure.id,
          items: filledItems.map((item) => ({
            supplyId: item.supplyId,
            quantity: Number(item.quantity),
          })),
        }),
      );
      toast({
        description: 'Kit atualizado',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar kit');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <p className="text-ink-3 text-sm">
        Ao concluir uma consulta deste procedimento, estes insumos são baixados
        automaticamente com custo vinculado ao atendimento.
      </p>
      {items.length === 0 && (
        <p className="text-ink-3 text-sm">
          Nenhum item — a conclusão não baixa estoque.
        </p>
      )}
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center gap-2">
          {/* SPEC_DEVIATION: ported alongside T13, não T7-T12 — este <select> não
              constava no "Where" de nenhuma task T6-T12 (tasks.md conta 22 selects
              nelas, spec.md declara baseline 23). Sem portá-lo aqui, a checagem #8
              do gate (T13) não fecha zero contra o app real. */}
          <NativeSelect
            value={item.supplyId}
            onChange={(e) =>
              setEdits(
                items.map((it, i) =>
                  i === index ? { ...it, supplyId: e.target.value } : it,
                ),
              )
            }
            className="flex-1"
          >
            <option value="">Selecione o insumo…</option>
            {optionsFor(index).map((supply) => (
              <option key={supply.id} value={supply.id}>
                {supply.name}
              </option>
            ))}
            {item.supplyId &&
              !activeSupplies.some((s) => s.id === item.supplyId) && (
                <option value={item.supplyId}>
                  {supplyName(item.supplyId)}
                </option>
              )}
          </NativeSelect>
          <Input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) =>
              setEdits(
                items.map((it, i) =>
                  i === index ? { ...it, quantity: e.target.value } : it,
                ),
              )
            }
            className="w-20"
          />
          <Button
            type="button"
            onClick={() => setEdits(items.filter((_, i) => i !== index))}
            variant="link"
            className="h-auto p-0 text-danger"
          >
            remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        onClick={() =>
          setEdits([
            ...items,
            { id: crypto.randomUUID(), supplyId: '', quantity: '1' },
          ])
        }
        variant="link"
        className="h-auto self-start p-0 text-accent-ink"
      >
        + Adicionar insumo
      </Button>
      <Button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        variant="accent"
        className="mt-1 self-start"
      >
        {saving ? 'Salvando…' : 'Salvar kit'}
      </Button>
    </div>
  );
}
