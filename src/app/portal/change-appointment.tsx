'use client';

import {
  Button,
  Card,
  CardContent,
  Input,
  Textarea,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import {
  PATIENT_CHANGE_MIN_NOTICE_HOURS,
  patientChangeDeadline,
} from '@/domain/scheduling/patient-self-service';
import { unwrapAction } from '@/lib/action-result';
import { apiFetch } from '@/lib/client';
import type { PortalAppointmentDto } from '@/lib/dto';
import { cancelAppointment } from './actions';
import {
  type AvailableSlotDto,
  dayKey,
  OFFER_WINDOW_DAYS,
  SlotPicker,
} from './schedule-return';

type Panel = 'none' | 'cancel' | 'reschedule';

interface ChangeAppointmentProps {
  appointment: PortalAppointmentDto;
  /** Relógio de referência da tela (carregamento da página). */
  nowMs: number;
  /** Antecedência mínima da política da clínica. */
  noticeHours?: number;
  onChanged: () => void;
}

/**
 * Cancelar ou remarcar a própria consulta pelo portal. Só aparece com a
 * antecedência mínima; dentro dela o paciente é orientado a falar com a
 * clínica — o servidor aplica a mesma regra de qualquer forma.
 */
export function ChangeAppointment({
  appointment,
  nowMs,
  noticeHours = PATIENT_CHANGE_MIN_NOTICE_HOURS,
  onChanged,
}: ChangeAppointmentProps) {
  const [panel, setPanel] = useState<Panel>('none');
  const deadline = patientChangeDeadline(
    new Date(appointment.startsAt),
    noticeHours,
  );

  if (nowMs > deadline.getTime()) {
    return (
      <p className="text-ink-3 text-xs">
        Para cancelar ou remarcar com menos de {noticeHours}h de antecedência,
        fale com a clínica.
      </p>
    );
  }

  const done = () => {
    setPanel('none');
    onChanged();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={panel === 'reschedule'}
          onClick={() =>
            setPanel((p) => (p === 'reschedule' ? 'none' : 'reschedule'))
          }
        >
          Remarcar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-danger"
          aria-expanded={panel === 'cancel'}
          onClick={() => setPanel((p) => (p === 'cancel' ? 'none' : 'cancel'))}
        >
          Cancelar consulta
        </Button>
      </div>
      {panel === 'cancel' && (
        <CancelPanel appointmentId={appointment.id} onDone={done} />
      )}
      {panel === 'reschedule' && (
        <ReschedulePanel appointmentId={appointment.id} onDone={done} />
      )}
    </div>
  );
}

function CancelPanel({
  appointmentId,
  onDone,
}: {
  appointmentId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        cancelAppointment({ appointmentId, reason: reason.trim() || null }),
      );
      toast({ description: 'Consulta cancelada', variant: 'success' });
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao cancelar a consulta',
      );
      setSaving(false);
    }
  };

  return (
    <Card className="border-danger">
      <CardContent className="p-3">
        <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-2">
          {error && <ErrorAlert message={error} />}
          <label className="font-medium text-sm">
            Motivo (opcional)
            <Textarea
              maxLength={1000}
              value={reason}
              disabled={saving}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: imprevisto no trabalho"
              className="mt-1"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={saving}
          >
            {saving ? 'Cancelando…' : 'Confirmar cancelamento'}
          </Button>
        </SafeForm>
      </CardContent>
    </Card>
  );
}

function ReschedulePanel({
  appointmentId,
  onDone,
}: {
  appointmentId: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  // Janela de oferta fixada na montagem (o relógio não pode ser lido em render).
  const [today] = useState(() => dayKey(new Date()));
  const [maxDate] = useState(() =>
    dayKey(new Date(Date.now() + OFFER_WINDOW_DAYS * 86_400_000)),
  );
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reschedule = async (slot: AvailableSlotDto) => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(
        `/api/portal/patient/appointments/${appointmentId}/reschedule`,
        {
          method: 'POST',
          body: JSON.stringify({ startsAt: slot.startsAt }),
        },
      );
      toast({ description: 'Consulta remarcada', variant: 'success' });
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao remarcar a consulta',
      );
      setSaving(false);
    }
  };

  return (
    <Card className="border-accent">
      <CardContent className="p-3">
        {error && <ErrorAlert message={error} />}
        <label className="font-medium text-sm">
          Novo dia
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
        <p className="mt-2 text-ink-3 text-xs">
          Mesmo procedimento e duração; você pode escolher um dia em até{' '}
          {OFFER_WINDOW_DAYS} dias a partir de hoje.
        </p>
        {date && (
          <SlotPicker
            query={`appointmentId=${encodeURIComponent(appointmentId)}`}
            date={date}
            disabled={saving}
            mode="reschedule"
            onPick={(slot) => void reschedule(slot)}
          />
        )}
      </CardContent>
    </Card>
  );
}
