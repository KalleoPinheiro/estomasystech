'use client';

import {
  Button,
  Card,
  Input,
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
import { EmptyState, ErrorAlert } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { SheetPanel } from '@/components/sheet-panel';
import { StatusBadge } from '@/components/status-badge';
import { unwrapAction } from '@/lib/action-result';
import type { ProcedureDto, SupplyDto } from '@/lib/dto';
import { formatCurrency } from '@/lib/format';
import { KitForm } from './kit-form';
import { updateProcedure } from './procedure-actions';
import { ProcedureForm } from './procedure-form';

/**
 * Lista de procedimentos com busca, ficha ao lado, kit e ativar/desativar. Os
 * dados chegam por props (a página os lê no servidor); gravar é Server Action
 * e a tela se atualiza sozinha.
 */
export function ProceduresBoard({
  procedures,
  supplies,
}: {
  procedures: ProcedureDto[];
  supplies: SupplyDto[];
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<ProcedureDto | null>(null);
  const [kitFor, setKitFor] = useState<ProcedureDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const filtered = procedures.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleActive = async (procedure: ProcedureDto) => {
    try {
      await unwrapAction(
        updateProcedure({ id: procedure.id, active: !procedure.active }),
      );
      toast({
        description: procedure.active
          ? 'Procedimento desativado'
          : 'Procedimento ativado',
        variant: 'success',
      });
      setActionError(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Erro ao atualizar procedimento',
      );
    }
  };

  return (
    <>
      {actionError && <ErrorAlert message={actionError} />}

      <SearchBar
        count={procedures.length}
        filteredCount={filtered.length}
        search={search}
        onSearch={setSearch}
      />

      <div
        className={
          editing
            ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
            : ''
        }
      >
        <ProceduresTable
          procedures={procedures}
          filtered={filtered}
          selectedId={editing?.id ?? null}
          onKit={setKitFor}
          onEdit={setEditing}
          onToggleActive={toggleActive}
        />
        {editing && (
          <SheetPanel
            key={editing.id}
            title="Editar procedimento"
            onClose={() => setEditing(null)}
          >
            <ProcedureForm initial={editing} onSaved={() => setEditing(null)} />
          </SheetPanel>
        )}
      </div>

      {kitFor && (
        <Modal
          title={`Kit de insumos — ${kitFor.name}`}
          onClose={() => setKitFor(null)}
        >
          <KitForm
            procedure={kitFor}
            supplies={supplies}
            onSaved={() => setKitFor(null)}
          />
        </Modal>
      )}
    </>
  );
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

interface ProceduresTableProps {
  procedures: ProcedureDto[];
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
      {procedures.length === 0 ? (
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
