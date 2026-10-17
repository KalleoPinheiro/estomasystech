'use client';

import {
  Button,
  Card,
  CardContent,
  Input,
  NativeSelect,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { PORTAL_BOOKING_HORIZON_DAYS } from '@/domain/scheduling/patient-self-service';
import { apiFetch } from '@/lib/client';
import type { ProcedureDto } from '@/lib/dto';
import { formatDateTime, formatTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { JoinWaitlist } from './waitlist';

export interface AvailableSlotDto {
  startsAt: string;
  endsAt: string;
}

/** Data local no formato aceito por <input type="date"> e pela API. */
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

export const OFFER_WINDOW_DAYS = PORTAL_BOOKING_HORIZON_DAYS;

interface ScheduleReturnProps {
  followUpId: string;
  onScheduled: () => void;
  onWaitlistJoined?: () => void;
}

/**
 * Auto-agendamento do retorno pelo paciente (PORT4-10/11): escolhe
 * procedimento e dia, vê os horários livres e confirma — sem ligar para a
 * clínica. Os horários vêm da mesma regra usada pela equipe.
 */
export function ScheduleReturn({
  followUpId,
  onScheduled,
  onWaitlistJoined,
}: ScheduleReturnProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        variant="accent"
        className="mt-2"
      >
        Agendar retorno
      </Button>
    );
  }

  return (
    <SchedulePanel
      followUpId={followUpId}
      onWaitlistJoined={onWaitlistJoined}
      onScheduled={() => {
        setOpen(false);
        onScheduled();
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

function SchedulePanel({
  followUpId,
  onScheduled,
  onCancel,
  onWaitlistJoined,
}: ScheduleReturnProps & { onCancel: () => void }) {
  const { toast } = useToast();
  const { data: procedures } = useApiQuery<ProcedureDto[]>(
    '/api/portal/patient/procedures',
  );
  const [procedureId, setProcedureId] = useState('');
  // Janela de oferta fixada na montagem (o relógio não pode ser lido em render).
  const [today] = useState(() => dayKey(new Date()));
  const [maxDate] = useState(() =>
    dayKey(new Date(Date.now() + OFFER_WINDOW_DAYS * 86_400_000)),
  );
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const schedule = async (slot: AvailableSlotDto) => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/portal/patient/appointments', {
        method: 'POST',
        body: JSON.stringify({
          procedureId,
          startsAt: slot.startsAt,
          followUpId,
        }),
      });
      toast({
        description: 'Retorno agendado',
        variant: 'success',
      });
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao agendar retorno');
      setSaving(false);
    }
  };

  return (
    <Card className="mt-2 border-accent">
      <CardContent className="p-3">
        {error && <ErrorAlert message={error} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="font-medium text-sm">
            Procedimento
            <NativeSelect
              value={procedureId}
              disabled={saving}
              onChange={(e) => setProcedureId(e.target.value)}
              className="mt-1"
            >
              <option value="">Selecione…</option>
              {(procedures ?? []).map((procedure) => (
                <option key={procedure.id} value={procedure.id}>
                  {procedure.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="font-medium text-sm">
            Dia
            <Input
              type="date"
              value={date}
              disabled={saving}
              min={today}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1"
            />
          </label>
        </div>
        {/* PORT-07: janela de oferta explicada — antes só existia como limite
          silencioso no `max` do input de data. */}
        <p className="mt-2 text-ink-3 text-xs">
          Você pode agendar em até {OFFER_WINDOW_DAYS} dias a partir de hoje.
        </p>

        {procedureId && date && (
          <SlotPicker
            query={`procedureId=${encodeURIComponent(procedureId)}`}
            date={date}
            emptyAction={
              <JoinWaitlist
                key={`${procedureId}|${date}`}
                procedureId={procedureId}
                fromDate={date}
                onJoined={onWaitlistJoined}
              />
            }
            disabled={saving}
            onPick={(slot) => void schedule(slot)}
          />
        )}

        <Button
          type="button"
          variant="link"
          onClick={onCancel}
          className="mt-3 h-auto px-0 font-medium text-ink-3 text-xs"
        >
          Cancelar
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Horários livres do dia — montado só com o dia e o que define a duração
 * escolhidos: `procedureId=…` (novo agendamento) ou `appointmentId=…`
 * (remarcação, com a duração e o profissional da própria consulta).
 */
export function SlotPicker({
  query,
  date,
  disabled,
  onPick,
  mode = 'schedule',
  emptyAction,
}: {
  query: string;
  date: string;
  disabled: boolean;
  onPick: (slot: AvailableSlotDto) => void;
  mode?: 'schedule' | 'reschedule';
  /** O que oferecer quando o dia não tem horário (ex.: lista de espera). */
  emptyAction?: React.ReactNode;
}) {
  const { data: slots, error } = useApiQuery<AvailableSlotDto[]>(
    `/api/portal/patient/slots?${query}&date=${encodeURIComponent(date)}`,
  );

  // Sem estes dois ramos a falha era silenciosa: o paciente via a área vazia e
  // concluía que não havia horário, quando na verdade a busca falhou.
  if (error) {
    return <ErrorAlert message={error} />;
  }
  if (!slots) {
    return <p className="mt-3 text-ink-3 text-xs">Buscando horários…</p>;
  }
  if (slots.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-ink-3 text-xs">
          Nenhum horário livre neste dia — tente outra data.
        </p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {slots.map((slot) => (
        // PORT-02: agendar é a ação mais consequente do portal — exige
        // confirmação explícita, e o alvo de toque usa o `sm` padrão do
        // design system (36px), não mais um `h-7` (28px) reduzido pra caber
        // na grade.
        <ConfirmAction
          key={slot.startsAt}
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="border-accent font-medium text-accent-ink hover:bg-accent-soft"
            >
              {formatTime(slot.startsAt)}
            </Button>
          }
          title={
            mode === 'reschedule'
              ? 'Confirmar remarcação'
              : 'Confirmar agendamento'
          }
          description={
            mode === 'reschedule'
              ? `Remarcar sua consulta para ${formatDateTime(slot.startsAt)}?`
              : `Agendar sua consulta para ${formatDateTime(slot.startsAt)}?`
          }
          confirmLabel="Confirmar"
          onConfirm={() => onPick(slot)}
        />
      ))}
    </div>
  );
}
