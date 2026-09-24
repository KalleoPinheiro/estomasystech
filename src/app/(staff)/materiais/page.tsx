'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Checkbox,
  Icon,
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
import type { AppointmentDto, StockMovementDto, SupplyDto } from '@/lib/dto';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

interface SupplyInsightDto {
  supplyId: string;
  avgDailyOut: number;
  daysToStockout: number | null;
}

interface ExpiringBatchDto {
  batchId: string;
  supplyId: string;
  supplyName: string;
  label: string | null;
  expiresAt: string;
  remaining: number;
  isExpired: boolean;
}

interface SupplyInsightsDto {
  bySupply: SupplyInsightDto[];
  expiringBatches: ExpiringBatchDto[];
}

const STOCKOUT_ALERT_DAYS = 30;

export default function SuppliesPage() {
  const {
    data: supplies,
    error,
    refresh,
  } = useApiQuery<SupplyDto[]>('/api/supplies');
  const {
    data: insights,
    error: insightsError,
    refresh: refreshInsights,
  } = useApiQuery<SupplyInsightsDto>('/api/supplies/insights');
  const [editing, setEditing] = useState<SupplyDto | 'new' | null>(null);
  const [moving, setMoving] = useState<SupplyDto | null>(null);
  const [history, setHistory] = useState<SupplyDto | null>(null);
  const [search, setSearch] = useState('');
  const filtered = (supplies ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Materiais e estoque"
        actions={
          <Button
            type="button"
            onClick={() => setEditing('new')}
            variant="accent"
          >
            + Novo insumo
          </Button>
        }
      />

      {error && <ErrorAlert message={error} />}
      <LowStockBanner supplies={supplies} onRepor={setMoving} />
      <ExpiryBanner batches={insights?.expiringBatches ?? []} />

      <SupplySearchBar
        count={supplies?.length ?? 0}
        filteredCount={filtered.length}
        search={search}
        onSearch={setSearch}
      />

      <SuppliesTable
        supplies={supplies}
        filtered={filtered}
        insights={insights?.bySupply ?? []}
        insightsError={insightsError}
        onMove={setMoving}
        onHistory={setHistory}
        onEdit={setEditing}
      />

      <EditSupplyModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />

      <MovementModal
        supply={moving}
        onClose={() => setMoving(null)}
        onSaved={() => {
          setMoving(null);
          refresh();
          refreshInsights();
        }}
      />

      <HistoryModal supply={history} onClose={() => setHistory(null)} />
    </div>
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

function MovementModal({
  supply,
  onClose,
  onSaved,
}: {
  supply: SupplyDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!supply) {
    return null;
  }
  return (
    <Modal title={`Movimentar — ${supply.name}`} onClose={onClose}>
      <MovementForm supply={supply} onSaved={onSaved} />
    </Modal>
  );
}

function HistoryModal({
  supply,
  onClose,
}: {
  supply: SupplyDto | null;
  onClose: () => void;
}) {
  if (!supply) {
    return null;
  }
  return (
    <Modal title={`Histórico — ${supply.name}`} onClose={onClose}>
      <MovementHistory supplyId={supply.id} />
    </Modal>
  );
}

interface EditSupplyModalProps {
  editing: SupplyDto | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditSupplyModal({ editing, onClose, onSaved }: EditSupplyModalProps) {
  if (!editing) {
    return null;
  }
  return (
    <Modal
      title={editing === 'new' ? 'Novo insumo' : 'Editar insumo'}
      onClose={onClose}
    >
      <SupplyForm
        initial={editing === 'new' ? undefined : editing}
        onSaved={onSaved}
      />
    </Modal>
  );
}

function LowStockBanner({
  supplies,
  onRepor,
}: {
  supplies: SupplyDto[] | null;
  onRepor: (supply: SupplyDto) => void;
}) {
  const low = (supplies ?? []).filter((s) => s.active && s.isLowStock);
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

function ExpiryBanner({ batches }: { batches: ExpiringBatchDto[] }) {
  if (batches.length === 0) {
    return null;
  }
  const expired = batches.filter((b) => b.isExpired);
  const expiring = batches.filter((b) => !b.isExpired);
  return (
    <>
      {expired.length > 0 && (
        <Alert variant="danger" className="mb-4" icon={<Icon name="blocked" />}>
          <AlertDescription>
            {expired.length}{' '}
            {expired.length === 1 ? 'lote vencido' : 'lotes vencidos'} com
            saldo:{' '}
            {expired
              .map((b) => `${b.supplyName}${b.label ? ` (${b.label})` : ''}`)
              .join(', ')}
          </AlertDescription>
        </Alert>
      )}
      {expiring.length > 0 && (
        <Alert
          variant="warning"
          className="mb-4"
          icon={<Icon name="pending" />}
        >
          <AlertDescription>
            {expiring.length}{' '}
            {expiring.length === 1 ? 'lote vence' : 'lotes vencem'} em até 30
            dias:{' '}
            {expiring
              .map(
                (b) =>
                  `${b.supplyName}${b.label ? ` (${b.label})` : ''} — ${formatDate(b.expiresAt)}`,
              )
              .join(', ')}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

interface SuppliesTableProps {
  supplies: SupplyDto[] | null;
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
      {!supplies ? (
        <LoadingIndicator />
      ) : supplies.length === 0 ? (
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

interface SupplyFormValues {
  name: string;
  unit: string;
  minQty: string;
  price: string;
  active: boolean;
}

const toSupplyFormValues = (initial?: SupplyDto): SupplyFormValues => ({
  name: initial?.name ?? '',
  unit: initial?.unit ?? 'un',
  minQty: initial ? String(initial.minQty) : '0',
  price: initial ? String(initial.priceCents / 100) : '',
  active: initial?.active ?? true,
});

const saveSupply = async (
  values: SupplyFormValues,
  initial?: SupplyDto,
): Promise<void> => {
  const payload = {
    name: values.name,
    unit: values.unit,
    minQty: Number(values.minQty),
    priceCents: Math.round(Number(values.price) * 100),
  };
  if (initial) {
    await apiFetch<SupplyDto>(`/api/supplies/${initial.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...payload, active: values.active }),
    });
    return;
  }
  await apiFetch<SupplyDto>('/api/supplies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

function SupplyForm({
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveSupply(values, initial);
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
    </form>
  );
}

const todayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
};

interface MovementFormState {
  type: 'in' | 'out';
  quantity: string;
  reason: string;
  appointmentId: string;
  batchLabel: string;
  expiresAt: string;
}

function buildMovementPayload(state: MovementFormState) {
  const isIn = state.type === 'in';
  return {
    type: state.type,
    quantity: Number(state.quantity),
    reason: state.reason,
    appointmentId: !isIn && state.appointmentId ? state.appointmentId : null,
    batchLabel: isIn && state.batchLabel ? state.batchLabel : null,
    expiresAt:
      isIn && state.expiresAt ? new Date(state.expiresAt).toISOString() : null,
  };
}

function canSubmitMovement(
  state: MovementFormState,
  exceedsBalance: boolean,
): boolean {
  return Boolean(state.quantity) && Boolean(state.reason) && !exceedsBalance;
}

function movementConfirmCopy(state: MovementFormState, supply: SupplyDto) {
  const isIn = state.type === 'in';
  return {
    title: isIn
      ? 'Confirmar entrada de estoque?'
      : 'Confirmar saída de estoque?',
    description: `${isIn ? 'Entrada' : 'Saída'} de ${state.quantity || 0} ${supply.unit} de "${supply.name}".`,
  };
}

function ExceedsBalanceWarning({
  show,
  supply,
}: {
  show: boolean;
  supply: SupplyDto;
}) {
  if (!show) {
    return null;
  }
  return (
    <span className="mt-1 block font-medium text-danger text-xs">
      Saldo atual é {supply.stockQty} {supply.unit} — quantidade maior que isso
      não pode sair.
    </span>
  );
}

function InMovementFields({
  batchLabel,
  expiresAt,
  onBatchLabel,
  onExpiresAt,
}: {
  batchLabel: string;
  expiresAt: string;
  onBatchLabel: (value: string) => void;
  onExpiresAt: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="font-medium text-sm">
        Lote (opcional)
        <Input
          value={batchLabel}
          onChange={(e) => onBatchLabel(e.target.value)}
          placeholder="Ex.: L2026-091"
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Validade (opcional)
        <Input
          type="date"
          value={expiresAt}
          onChange={(e) => onExpiresAt(e.target.value)}
          className="mt-1"
        />
      </label>
    </div>
  );
}

function OutMovementFields({
  appointmentId,
  appointments,
  onAppointmentId,
}: {
  appointmentId: string;
  appointments: AppointmentDto[];
  onAppointmentId: (value: string) => void;
}) {
  return (
    <label className="font-medium text-sm">
      Consulta atendida (custo por atendimento)
      <NativeSelect
        value={appointmentId}
        onChange={(e) => onAppointmentId(e.target.value)}
        className="mt-1"
      >
        <option value="">— sem vínculo —</option>
        {appointments.map((appointment) => (
          <option key={appointment.id} value={appointment.id}>
            {new Date(appointment.startsAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            — {appointment.patientName ?? 'Paciente'} ({appointment.procedure})
          </option>
        ))}
      </NativeSelect>
      <span className="mt-1 block font-normal text-ink-3 text-xs">
        Vincular a saída à consulta alimenta a margem por procedimento no
        relatório.
      </span>
    </label>
  );
}

function MovementForm({
  supply,
  onSaved,
}: {
  supply: SupplyDto;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [{ from, to }] = useState(todayRange);
  const { data: todayAppointments } = useApiQuery<AppointmentDto[]>(
    `/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

  const exceedsBalance = type === 'out' && Number(quantity) > supply.stockQty;

  const formState: MovementFormState = {
    type,
    quantity,
    reason,
    appointmentId,
    batchLabel,
    expiresAt,
  };

  const doSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch<SupplyDto>(`/api/supplies/${supply.id}/movements`, {
        method: 'POST',
        body: JSON.stringify(buildMovementPayload(formState)),
      });
      toast({
        description: type === 'in' ? 'Entrada registrada' : 'Saída registrada',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao movimentar estoque',
      );
    } finally {
      setSaving(false);
    }
  };
  const confirmCopy = movementConfirmCopy(formState, supply);

  return (
    // Confirmação (MAT-08) acontece só via ConfirmAction abaixo — o form não
    // envia sozinho no Enter, só bloqueia o reload padrão.
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-3"
    >
      {error && <ErrorAlert message={error} />}
      <p className="text-ink-2 text-sm">
        Estoque atual:{' '}
        <strong>
          {supply.stockQty} {supply.unit}
        </strong>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Tipo *
          <NativeSelect
            value={type}
            onChange={(e) => setType(e.target.value as 'in' | 'out')}
            className="mt-1"
          >
            <option value="in">Entrada (compra/devolução)</option>
            <option value="out">Saída (uso/perda)</option>
          </NativeSelect>
        </label>
        <label className="font-medium text-sm">
          Quantidade *
          <Input
            required
            type="number"
            min="1"
            max={type === 'out' ? supply.stockQty : undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1"
          />
          <ExceedsBalanceWarning show={exceedsBalance} supply={supply} />
        </label>
      </div>
      <label className="font-medium text-sm">
        Motivo *
        <Input
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex.: Uso em atendimento, compra fornecedor X, vencimento…"
          className="mt-1"
        />
      </label>
      {type === 'in' && (
        <InMovementFields
          batchLabel={batchLabel}
          expiresAt={expiresAt}
          onBatchLabel={setBatchLabel}
          onExpiresAt={setExpiresAt}
        />
      )}
      {type === 'out' && (
        <OutMovementFields
          appointmentId={appointmentId}
          appointments={todayAppointments ?? []}
          onAppointmentId={setAppointmentId}
        />
      )}
      <ConfirmAction
        trigger={
          <Button
            type="button"
            disabled={saving || !canSubmitMovement(formState, exceedsBalance)}
            variant="accent"
            className="mt-1"
          >
            {saving ? 'Registrando…' : 'Registrar movimentação'}
          </Button>
        }
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel="Confirmar"
        onConfirm={doSubmit}
      />
    </form>
  );
}

const MOVEMENTS_VISIBLE_DEFAULT = 10;

function MovementHistory({ supplyId }: { supplyId: string }) {
  const { data: movements, error } = useApiQuery<StockMovementDto[]>(
    `/api/supplies/${supplyId}/movements`,
  );
  const [showAll, setShowAll] = useState(false);

  if (error) return <ErrorAlert message={error} />;
  if (!movements) return <LoadingIndicator />;
  if (movements.length === 0)
    return <EmptyState message="Nenhuma movimentação registrada." />;

  const visible = showAll
    ? movements
    : movements.slice(0, MOVEMENTS_VISIBLE_DEFAULT);

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-border text-sm">
        {visible.map((movement) => (
          <li key={movement.id} className="flex items-center gap-3 py-2">
            <span
              className={`inline-block w-14 rounded-full px-2 py-0.5 text-center font-medium text-xs ${
                movement.type === 'in'
                  ? 'bg-success-soft text-success'
                  : 'bg-surface-2 text-ink-2'
              }`}
            >
              {movement.type === 'in' ? '+' : '−'}
              {movement.quantity}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate">{movement.reason}</p>
              <p className="text-ink-3 text-xs">
                {formatDateTime(movement.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!showAll && movements.length > MOVEMENTS_VISIBLE_DEFAULT && (
        <Button
          type="button"
          onClick={() => setShowAll(true)}
          variant="link"
          className="h-auto self-start p-0"
        >
          Ver mais ({movements.length - MOVEMENTS_VISIBLE_DEFAULT})
        </Button>
      )}
    </div>
  );
}
