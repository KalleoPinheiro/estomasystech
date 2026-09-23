'use client';

import { Button, Input, NativeSelect } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { StatusBadge } from '@/components/status-badge';
import type { AppointmentDto } from '@/lib/dto';
import {
  APPOINTMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatTime,
} from '@/lib/format';

type AppointmentAction = 'confirm' | 'cancel' | 'no_show' | 'complete';

interface AppointmentDetailProps {
  appointment: AppointmentDto;
  onAction: (
    action: AppointmentAction,
    followUpInDays?: number | null,
  ) => Promise<void>;
  onReschedule: (startsAt: Date, endsAt: Date) => Promise<void>;
}

const FOLLOW_UP_OPTIONS = [
  { value: 0, label: 'Sem retorno' },
  { value: 7, label: 'Retorno em 7 dias' },
  { value: 15, label: 'Retorno em 15 dias' },
  { value: 30, label: 'Retorno em 30 dias' },
  { value: 60, label: 'Retorno em 60 dias' },
  { value: 90, label: 'Retorno em 90 dias' },
];

const ACTION_BUTTONS: Array<{
  action: AppointmentAction;
  label: string;
  className: string;
}> = [
  {
    action: 'confirm',
    label: 'Confirmar',
    className: 'bg-accent-ink hover:bg-accent-strong',
  },
  {
    action: 'complete',
    label: 'Concluir + faturar',
    className: 'bg-success hover:bg-success',
  },
  {
    action: 'no_show',
    label: 'Registrar falta',
    className: 'bg-warning hover:bg-warning',
  },
  {
    action: 'cancel',
    label: 'Cancelar',
    className: 'bg-danger hover:bg-danger',
  },
];

const VISIBLE_ACTIONS: Record<string, AppointmentAction[]> = {
  scheduled: ['confirm', 'complete', 'no_show', 'cancel'],
  confirmed: ['complete', 'no_show', 'cancel'],
};

export function AppointmentDetail({
  appointment,
  onAction,
  onReschedule,
}: AppointmentDetailProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [followUpInDays, setFollowUpInDays] = useState(30);
  const [newDate, setNewDate] = useState(appointment.startsAt.slice(0, 10));
  const [newTime, setNewTime] = useState(formatTime(appointment.startsAt));

  const durationMs =
    new Date(appointment.endsAt).getTime() -
    new Date(appointment.startsAt).getTime();
  const visibleActions = VISIBLE_ACTIONS[appointment.status] ?? [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao atualizar consulta',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = () =>
    run(async () => {
      const startsAt = new Date(`${newDate}T${newTime}:00`);
      const endsAt = new Date(startsAt.getTime() + durationMs);
      await onReschedule(startsAt, endsAt);
    });

  return (
    <div className="flex flex-col gap-3 text-sm">
      {error && <ErrorAlert message={error} />}
      <div className="flex items-center justify-between">
        <p className="font-semibold text-base">{appointment.patientName}</p>
        <StatusBadge
          status={appointment.status}
          label={
            APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status
          }
        />
      </div>
      <p>
        <span className="text-ink-3">Data: </span>
        {formatDate(appointment.startsAt)}, {formatTime(appointment.startsAt)}–
        {formatTime(appointment.endsAt)}
      </p>
      <p>
        <span className="text-ink-3">Procedimento: </span>
        {appointment.procedure}
      </p>
      <p>
        <span className="text-ink-3">Valor: </span>
        {formatCurrency(appointment.priceCents)}
      </p>
      {appointment.notes && (
        <p>
          <span className="text-ink-3">Observações: </span>
          {appointment.notes}
        </p>
      )}

      {appointment.status === 'cancelled' && appointment.cancelledAt && (
        <p>
          <span className="text-ink-3">Cancelada </span>
          {appointment.cancelledBy === 'patient'
            ? 'pelo paciente no portal'
            : 'pela clínica'}{' '}
          em {formatDate(appointment.cancelledAt)},{' '}
          {formatTime(appointment.cancelledAt)}
          {appointment.cancelReason && ` — ${appointment.cancelReason}`}
        </p>
      )}

      <a
        href={`/documentos/atestado/${appointment.id}`}
        className="font-medium text-accent-ink text-xs hover:underline"
      >
        Declaração de comparecimento
      </a>

      {visibleActions.includes('complete') && (
        <label className="mt-1 font-medium text-ink-2 text-xs">
          Ao concluir, programar retorno:
          <NativeSelect
            value={followUpInDays}
            onChange={(e) => setFollowUpInDays(Number(e.target.value))}
          >
            {FOLLOW_UP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}

      {visibleActions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ACTION_BUTTONS.filter((button) =>
            visibleActions.includes(button.action),
          ).map((button) => (
            <Button
              key={button.action}
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  onAction(
                    button.action,
                    button.action === 'complete' && followUpInDays > 0
                      ? followUpInDays
                      : null,
                  ),
                )
              }
              variant="ghost"
              className={button.className}
            >
              {button.label}
            </Button>
          ))}
          <Button
            type="button"
            disabled={busy}
            onClick={() => setRescheduling((prev) => !prev)}
            variant="outline"
            className="text-ink hover:bg-bg"
          >
            Remarcar
          </Button>
        </div>
      )}

      {rescheduling && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg p-3">
          <label className="font-medium text-xs">
            Nova data
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="font-medium text-xs">
            Novo horário
            <Input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="mt-1"
            />
          </label>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleReschedule()}
            variant="accent"
          >
            Confirmar remarcação
          </Button>
        </div>
      )}
    </div>
  );
}
