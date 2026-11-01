'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { unwrapAction } from '@/lib/action-result';
import type { AppointmentDto, SupplyDto } from '@/lib/dto';
import { formatTime } from '@/lib/format';
import { registerStockMovement } from './supply-actions';

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
            {formatTime(appointment.startsAt)} —{' '}
            {appointment.patientName ?? 'Paciente'} ({appointment.procedure})
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

export function MovementForm({
  supply,
  appointments,
  onSaved,
}: {
  supply: SupplyDto;
  appointments: AppointmentDto[];
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
      await unwrapAction(
        registerStockMovement({
          supplyId: supply.id,
          ...buildMovementPayload(formState),
        }),
      );
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
          appointments={appointments}
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
