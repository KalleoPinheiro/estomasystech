'use client';

import {
  Button,
  Card,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { ProcedureDto, SupplyDto } from '@/lib/dto';
import { formatCurrency } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

export default function ProceduresPage() {
  const { toast } = useToast();
  const {
    data: procedures,
    error,
    refresh,
  } = useApiQuery<ProcedureDto[]>('/api/procedures');
  const [editing, setEditing] = useState<ProcedureDto | 'new' | null>(null);
  const [kitFor, setKitFor] = useState<ProcedureDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const filtered = (procedures ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = editing && editing !== 'new' ? editing : null;
  const onSaved = () => {
    setEditing(null);
    refresh();
  };

  const toggleActive = async (procedure: ProcedureDto) => {
    try {
      await apiFetch(`/api/procedures/${procedure.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !procedure.active }),
      });
      toast({
        description: procedure.active
          ? 'Procedimento desativado'
          : 'Procedimento ativado',
        variant: 'success',
      });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar procedimento',
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Procedimentos"
        description="O tempo define o tamanho do horário na agenda. Nome, preço e duração vêm só daqui, então a margem por procedimento fica consistente."
        actions={
          <Button
            type="button"
            onClick={() => setEditing('new')}
            variant="accent"
          >
            + Novo procedimento
          </Button>
        }
      />

      <ErrorAlertOrNull message={resolveErrorMessage(actionError, error)} />

      <SearchBar
        count={procedures?.length ?? 0}
        filteredCount={filtered.length}
        search={search}
        onSearch={setSearch}
      />

      <div
        className={
          selected
            ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
            : ''
        }
      >
        <ProceduresTable
          procedures={procedures}
          filtered={filtered}
          selectedId={selected?.id ?? null}
          onKit={setKitFor}
          onEdit={setEditing}
          onToggleActive={toggleActive}
        />
        {selected && (
          <ProcedureSheet
            key={selected.id}
            procedure={selected}
            onClose={() => setEditing(null)}
            onSaved={onSaved}
          />
        )}
      </div>

      <KitModal procedure={kitFor} onClose={() => setKitFor(null)} />

      <NewProcedureModal
        open={editing === 'new'}
        onClose={() => setEditing(null)}
        onSaved={onSaved}
      />
    </div>
  );
}

function resolveErrorMessage(
  actionError: string | null,
  loadError: string | null,
): string | null {
  return actionError ?? loadError;
}

function ErrorAlertOrNull({ message }: { message: string | null }) {
  return message ? <ErrorAlert message={message} /> : null;
}

function SearchBar({
  count,
  filteredCount,
  search,
  onSearch,
}: {
  count: number;
  filteredCount: number;
  search: string;
  onSearch: (value: string) => void;
}) {
  if (count === 0) {
    return null;
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Buscar por nome…"
        className="max-w-sm"
      />
      <span className="text-ink-3 text-sm">
        {filteredCount} {filteredCount === 1 ? 'procedimento' : 'procedimentos'}
      </span>
    </div>
  );
}

function NewProcedureModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <Modal title="Novo procedimento" onClose={onClose}>
      <ProcedureForm onSaved={onSaved} />
    </Modal>
  );
}

/** Ficha ao lado da lista: o procedimento escolhido se edita sem sair da lista. */
function ProcedureSheet({
  procedure,
  onClose,
  onSaved,
}: {
  procedure: ProcedureDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">Editar procedimento</h2>
        <Button type="button" onClick={onClose} variant="ghost" size="sm">
          Fechar ficha
        </Button>
      </div>
      <ProcedureForm initial={procedure} onSaved={onSaved} />
    </Card>
  );
}

interface ProceduresTableProps {
  procedures: ProcedureDto[] | null;
  filtered: ProcedureDto[];
  selectedId: string | null;
  onKit: (procedure: ProcedureDto) => void;
  onEdit: (procedure: ProcedureDto) => void;
  onToggleActive: (procedure: ProcedureDto) => void;
}

function ProceduresTable({
  procedures,
  filtered,
  selectedId,
  onKit,
  onEdit,
  onToggleActive,
}: ProceduresTableProps) {
  return (
    <Card>
      {!procedures ? (
        <LoadingIndicator />
      ) : procedures.length === 0 ? (
        <EmptyState message="Nenhum procedimento cadastrado — o agendamento continua com texto livre até o catálogo existir." />
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum procedimento encontrado para a busca." />
      ) : (
        <div className="overflow-x-auto">
          <Table stack className="w-full text-left text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4 py-3">Procedimento</TableHead>
                <TableHead className="px-4 py-3">Preço padrão</TableHead>
                <TableHead className="px-4 py-3">Duração</TableHead>
                <TableHead className="px-4 py-3">Situação</TableHead>
                <TableHead className="px-4 py-3 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((procedure) => (
                <ProcedureRow
                  key={procedure.id}
                  procedure={procedure}
                  selected={procedure.id === selectedId}
                  onKit={() => onKit(procedure)}
                  onEdit={() => onEdit(procedure)}
                  onToggleActive={() => onToggleActive(procedure)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function ProcedureRow({
  procedure,
  selected,
  onKit,
  onEdit,
  onToggleActive,
}: {
  procedure: ProcedureDto;
  selected: boolean;
  onKit: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  return (
    <TableRow
      aria-selected={selected}
      className={`${procedure.active ? '' : 'opacity-50'} ${selected ? 'bg-sv-surface' : ''}`}
    >
      <TableCell label="Procedimento" className="px-4 py-3 font-medium">
        {procedure.name}
      </TableCell>
      <TableCell label="Preço padrão" className="px-4 py-3">
        {formatCurrency(procedure.priceCents)}
      </TableCell>
      <TableCell label="Duração" className="px-4 py-3 text-ink-2">
        {procedure.durationMinutes} min
      </TableCell>
      <TableCell label="Situação" className="px-4 py-3">
        <StatusBadge
          status={procedure.active ? 'confirmed' : 'cancelled'}
          label={procedure.active ? 'Ativo' : 'Inativo'}
        />
      </TableCell>
      <TableCell label="Ações" className="px-4 py-3 text-right">
        <Button type="button" onClick={onKit} variant="ghost" size="sm">
          {procedure.kitItemCount > 0
            ? `Kit (${procedure.kitItemCount})`
            : 'Sem kit'}
        </Button>
        <Button type="button" onClick={onEdit} variant="ghost" size="sm">
          Editar
        </Button>
        {procedure.active ? (
          <ConfirmAction
            trigger={
              <Button type="button" variant="ghost" size="sm">
                Desativar
              </Button>
            }
            title="Desativar procedimento?"
            description="O procedimento para de estar disponível pra agendar."
            confirmLabel="Confirmar"
            variant="danger"
            onConfirm={onToggleActive}
          />
        ) : (
          <Button
            type="button"
            onClick={onToggleActive}
            variant="ghost"
            size="sm"
          >
            Reativar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function ProcedureForm({
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
      if (initial) {
        await apiFetch(`/api/procedures/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/api/procedures', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
    </form>
  );
}

function KitModal({
  procedure,
  onClose,
}: {
  procedure: ProcedureDto | null;
  onClose: () => void;
}) {
  if (!procedure) {
    return null;
  }
  return (
    <Modal title={`Kit de insumos — ${procedure.name}`} onClose={onClose}>
      <KitForm procedure={procedure} onSaved={onClose} />
    </Modal>
  );
}

interface KitItemDraft {
  id: string;
  supplyId: string;
  quantity: string;
}

/** Kit padrão do procedimento: baixado automaticamente ao concluir a consulta. */
function KitForm({
  procedure,
  onSaved,
}: {
  procedure: ProcedureDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: supplies } = useApiQuery<SupplyDto[]>('/api/supplies');
  const { data: kit } = useApiQuery<{
    items: Array<{ supplyId: string; quantity: number }>;
  }>(`/api/procedures/${procedure.id}/kit`);
  const [edits, setEdits] = useState<KitItemDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!supplies || !kit) return <LoadingIndicator />;

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
      await apiFetch(`/api/procedures/${procedure.id}/kit`, {
        method: 'PUT',
        body: JSON.stringify({
          items: filledItems.map((item) => ({
            supplyId: item.supplyId,
            quantity: Number(item.quantity),
          })),
        }),
      });
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
