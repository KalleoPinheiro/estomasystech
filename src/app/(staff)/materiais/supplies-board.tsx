'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Icon,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useState } from 'react';
import { EmptyState } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { SheetPanel } from '@/components/sheet-panel';
import { StatusBadge } from '@/components/status-badge';
import type { AppointmentDto, SupplyDto } from '@/lib/dto';
import { formatCurrency } from '@/lib/format';
import type { SupplyInsightsDto } from '@/lib/server/data/supplies';
import { MovementForm } from './movement-form';
import { MovementHistory } from './movement-history';
import { SupplyForm } from './supply-form';

type SupplyInsightDto = SupplyInsightsDto['bySupply'][number];

const STOCKOUT_ALERT_DAYS = 30;

/**
 * Lista de insumos com busca, edição ao lado, movimentação e histórico. Os
 * dados chegam por props (a página os lê no servidor); gravar é Server Action
 * e a tela se atualiza sozinha.
 */
export function SuppliesBoard({
  supplies,
  insights,
  insightsError,
  todayAppointments,
}: {
  supplies: SupplyDto[];
  insights: SupplyInsightDto[];
  insightsError: string | null;
  todayAppointments: AppointmentDto[];
}) {
  const [editing, setEditing] = useState<SupplyDto | null>(null);
  const [moving, setMoving] = useState<SupplyDto | null>(null);
  const [history, setHistory] = useState<SupplyDto | null>(null);
  const [search, setSearch] = useState('');
  const filtered = supplies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <LowStockBanner supplies={supplies} onRepor={setMoving} />

      <SupplySearchBar
        count={supplies.length}
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
        <SuppliesTable
          supplies={supplies}
          filtered={filtered}
          insights={insights}
          insightsError={insightsError}
          onMove={setMoving}
          onHistory={setHistory}
          onEdit={setEditing}
        />
        {editing && (
          <SheetPanel
            key={editing.id}
            title="Editar insumo"
            onClose={() => setEditing(null)}
          >
            <SupplyForm initial={editing} onSaved={() => setEditing(null)} />
          </SheetPanel>
        )}
      </div>

      {moving && (
        <Modal
          title={`Movimentar — ${moving.name}`}
          onClose={() => setMoving(null)}
        >
          <MovementForm
            supply={moving}
            appointments={todayAppointments}
            onSaved={() => setMoving(null)}
          />
        </Modal>
      )}

      {history && (
        <Modal
          title={`Histórico — ${history.name}`}
          onClose={() => setHistory(null)}
        >
          <MovementHistory supplyId={history.id} />
        </Modal>
      )}
    </>
  );
}

function SupplySearchBar({
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
        {filteredCount} {filteredCount === 1 ? 'insumo' : 'insumos'}
      </span>
    </div>
  );
}

function LowStockBanner({
  supplies,
  onRepor,
}: {
  supplies: SupplyDto[];
  onRepor: (supply: SupplyDto) => void;
}) {
  const low = supplies.filter((s) => s.active && s.isLowStock);
  if (low.length === 0) {
    return null;
  }
  return (
    <Alert
      variant="warning"
      className="mb-4"
      icon={<Icon name="alert-triangle" />}
    >
      <AlertDescription>
        {low.length} {low.length === 1 ? 'insumo está' : 'insumos estão'} com
        estoque baixo (≤ mínimo):{' '}
        {low.map((supply, index) => (
          <span key={supply.id}>
            {index > 0 && ', '}
            {supply.name} (
            <Button
              type="button"
              onClick={() => onRepor(supply)}
              variant="link"
              className="h-auto p-0 font-semibold text-warning underline"
              aria-label={`Repor ${supply.name}`}
            >
              repor
            </Button>
            )
          </span>
        ))}
        .
      </AlertDescription>
    </Alert>
  );
}

interface SuppliesTableProps {
  supplies: SupplyDto[];
  filtered: SupplyDto[];
  insights: SupplyInsightDto[];
  insightsError: string | null;
  onMove: (supply: SupplyDto) => void;
  onHistory: (supply: SupplyDto) => void;
  onEdit: (supply: SupplyDto) => void;
}

function SuppliesTable({
  supplies,
  filtered,
  insights,
  insightsError,
  onMove,
  onHistory,
  onEdit,
}: SuppliesTableProps) {
  const insightBySupply = new Map(insights.map((i) => [i.supplyId, i]));
  return (
    <Card>
      {supplies.length === 0 ? (
        <EmptyState message="Nenhum insumo cadastrado." />
      ) : filtered.length === 0 ? (
        <EmptyState message="Nenhum insumo encontrado para a busca." />
      ) : (
        <div className="overflow-x-auto">
          <Table stack className="w-full text-left text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4 py-3">Insumo</TableHead>
                <TableHead className="px-4 py-3">Estoque</TableHead>
                <TableHead className="px-4 py-3">Mínimo</TableHead>
                <TableHead className="px-4 py-3">Previsão</TableHead>
                <TableHead className="px-4 py-3">Preço</TableHead>
                <TableHead className="px-4 py-3">Situação</TableHead>
                <TableHead className="px-4 py-3 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((supply) => (
                <SupplyRow
                  key={supply.id}
                  supply={supply}
                  insight={insightBySupply.get(supply.id)}
                  insightsError={insightsError}
                  onMove={() => onMove(supply)}
                  onHistory={() => onHistory(supply)}
                  onEdit={() => onEdit(supply)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

interface SupplyRowProps {
  supply: SupplyDto;
  insight?: SupplyInsightDto;
  insightsError: string | null;
  onMove: () => void;
  onHistory: () => void;
  onEdit: () => void;
}

function StockoutForecast({
  insight,
  insightsError,
}: {
  insight?: SupplyInsightDto;
  insightsError: string | null;
}) {
  if (insightsError) {
    return (
      <span
        className="inline-flex items-center gap-1 text-danger"
        title={insightsError}
      >
        <Icon name="alert-circle" /> Erro ao calcular
      </span>
    );
  }
  if (!insight || insight.daysToStockout == null) {
    return <span className="text-ink-3">—</span>;
  }
  const days = insight.daysToStockout;
  const urgent = days <= STOCKOUT_ALERT_DAYS;
  return (
    <span className={urgent ? 'font-medium text-danger' : 'text-ink-2'}>
      ~{days} {days === 1 ? 'dia' : 'dias'}
    </span>
  );
}

function SupplyRow({
  supply,
  insight,
  insightsError,
  onMove,
  onHistory,
  onEdit,
}: SupplyRowProps) {
  return (
    <TableRow className={supply.active ? '' : 'opacity-50'}>
      <TableCell label="Insumo" className="px-4 py-3 font-medium">
        {supply.name}
      </TableCell>
      <TableCell label="Estoque" className="px-4 py-3">
        {supply.stockQty} {supply.unit}
        {supply.active && supply.isLowStock && (
          <span className="ml-2">
            {supply.isOutOfStock ? (
              <StatusBadge status="out_of_stock" label="Sem estoque" />
            ) : (
              <StatusBadge status="pending" label="Estoque baixo" />
            )}
          </span>
        )}
      </TableCell>
      <TableCell label="Mínimo" className="px-4 py-3 text-ink-2">
        {supply.minQty}
      </TableCell>
      <TableCell label="Previsão" className="px-4 py-3">
        <StockoutForecast insight={insight} insightsError={insightsError} />
      </TableCell>
      <TableCell label="Preço" className="px-4 py-3">
        {formatCurrency(supply.priceCents)}
      </TableCell>
      <TableCell label="Situação" className="px-4 py-3">
        <StatusBadge
          status={supply.active ? 'confirmed' : 'cancelled'}
          label={supply.active ? 'Ativo' : 'Inativo'}
        />
      </TableCell>
      <TableCell
        label="Ações"
        className="px-4 py-3 text-right text-sm sm:whitespace-nowrap"
      >
        <Button type="button" onClick={onMove} variant="ghost" size="sm">
          Movimentar
        </Button>
        <Button type="button" onClick={onHistory} variant="ghost" size="sm">
          Histórico
        </Button>
        <Button type="button" onClick={onEdit} variant="ghost" size="sm">
          Editar
        </Button>
      </TableCell>
    </TableRow>
  );
}
