'use client';

import { Button, Checkbox, Input } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { SafeForm } from '@/components/safe-form';
import { fromTimeInput, toTimeInput } from '@/domain/scheduling/time-of-day';
import { unwrapAction } from '@/lib/action-result';
import type { ProfessionalDto, WeeklyWindowDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { saveAvailability } from './professional-actions';

const WEEKDAYS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

interface DayDraft {
  enabled: boolean;
  start: string;
  end: string;
}

const toDrafts = (windows: WeeklyWindowDto[]): DayDraft[] =>
  WEEKDAYS.map((_, weekday) => {
    const window = windows.find((w) => w.weekday === weekday);
    return window
      ? {
          enabled: true,
          start: toTimeInput(window.startMinute),
          end: toTimeInput(window.endMinute),
        }
      : { enabled: false, start: '08:00', end: '18:00' };
  });

/**
 * Horário semanal do profissional (uma janela por dia). Sem nenhum dia
 * marcado, ele segue só a grade da clínica. A pausa de almoço da clínica
 * continua valendo dentro da janela.
 */
export function AvailabilityForm({
  professional,
  onDone,
}: {
  professional: ProfessionalDto;
  onDone: () => void;
}) {
  const { data, error } = useApiQuery<{ windows: WeeklyWindowDto[] }>(
    `/api/professionals/${professional.id}/availability`,
  );
  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;
  return (
    <AvailabilityEditor
      professionalId={professional.id}
      initial={toDrafts(data.windows)}
      onDone={onDone}
    />
  );
}

function AvailabilityEditor({
  professionalId,
  initial,
  onDone,
}: {
  professionalId: string;
  initial: DayDraft[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [days, setDays] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (weekday: number, change: Partial<DayDraft>) =>
    setDays((prev) =>
      prev.map((day, index) =>
        index === weekday ? { ...day, ...change } : day,
      ),
    );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await unwrapAction(
        saveAvailability({
          professionalId,
          windows: days.flatMap((day, weekday) =>
            day.enabled
              ? [
                  {
                    weekday,
                    startMinute: fromTimeInput(day.start),
                    endMinute: fromTimeInput(day.end),
                  },
                ]
              : [],
          ),
        }),
      );
      toast({ description: 'Horários salvos', variant: 'success' });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar horários');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeForm onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <p className="text-ink-3 text-sm">
        Marque os dias em que o profissional atende. Sem nenhum dia marcado, ele
        segue a grade da clínica.
      </p>
      {days.map((day, weekday) => (
        <div
          key={WEEKDAYS[weekday]}
          className="grid grid-cols-3 items-end gap-2"
        >
          <label className="flex items-center gap-2 font-medium text-sm">
            <Checkbox
              checked={day.enabled}
              onChange={(e) => update(weekday, { enabled: e.target.checked })}
            />
            {WEEKDAYS[weekday]}
          </label>
          <Input
            type="time"
            step={300}
            aria-label={`${WEEKDAYS[weekday]}: início`}
            disabled={!day.enabled}
            value={day.start}
            onChange={(e) => update(weekday, { start: e.target.value })}
          />
          <Input
            type="time"
            step={300}
            aria-label={`${WEEKDAYS[weekday]}: fim`}
            disabled={!day.enabled}
            value={day.end}
            onChange={(e) => update(weekday, { end: e.target.value })}
          />
        </div>
      ))}
      <Button type="submit" variant="accent" disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar horários'}
      </Button>
    </SafeForm>
  );
}
