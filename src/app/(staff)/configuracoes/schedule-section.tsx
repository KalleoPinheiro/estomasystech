'use client';

import { Button, Card, Input } from '@still-void/ui/react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import type { CancellationPolicy } from '@/domain/scheduling/schedule-config';
import { useApiQuery } from '@/lib/use-api-query';
import { useSavableForm } from '@/lib/use-savable-form';
import { CancellationPolicyFields } from './cancellation-policy-fields';
import { LunchBreakFields } from './lunch-break-fields';

const WEEKDAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

interface ScheduleConfigDto {
  weekdays: number[];
  startHour: number;
  endHour: number;
  minGapMinutes: number;
  lunchBreak?: { startMinute: number; endMinute: number } | null;
  cancellationPolicy?: CancellationPolicy;
}

function validateScheduleDraft(draft: ScheduleConfigDto): string | null {
  if (draft.startHour >= draft.endHour) {
    return 'Horário de abertura deve ser antes do fechamento';
  }
  if (draft.minGapMinutes < 15 || draft.minGapMinutes > 120) {
    return 'Intervalo mínimo deve estar entre 15 e 120 minutos';
  }
  const lunch = draft.lunchBreak;
  if (
    lunch &&
    (lunch.startMinute >= lunch.endMinute ||
      lunch.startMinute <= draft.startHour * 60 ||
      lunch.endMinute >= draft.endHour * 60)
  ) {
    return 'O almoço precisa começar antes de terminar e ficar dentro do horário de funcionamento';
  }
  return null;
}

export function ScheduleSection() {
  const { data, error, refresh } = useApiQuery<{
    config: ScheduleConfigDto;
    isDefault: boolean;
  }>('/api/settings/schedule');

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingIndicator />;

  return (
    <ScheduleForm
      config={data.config}
      isDefault={data.isDefault}
      onSaved={refresh}
    />
  );
}

function ScheduleForm({
  config,
  isDefault,
  onSaved,
}: {
  config: ScheduleConfigDto;
  isDefault: boolean;
  onSaved: () => void;
}) {
  const { draft, setDraft, saveError, save } = useSavableForm({
    endpoint: '/api/settings/schedule',
    initialValue: config,
    successMessage: 'Grade salva — vale imediatamente para novos agendamentos.',
    errorFallback: 'Erro ao salvar grade',
    onSaved,
    validate: validateScheduleDraft,
  });

  const toggleDay = (day: number) =>
    setDraft((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b),
    }));

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Grade de horários</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Define dias e janela de atendimento usados na validação da agenda.
        {isDefault && ' (usando padrão — nada salvo ainda)'}
      </p>
      {saveError && <ErrorAlert message={saveError} />}

      <div className="mb-4 flex flex-wrap gap-2">
        {WEEKDAYS.map((day) => (
          <Button
            key={day.value}
            type="button"
            onClick={() => toggleDay(day.value)}
            size="sm"
            variant={draft.weekdays.includes(day.value) ? 'accent' : 'outline'}
            aria-pressed={draft.weekdays.includes(day.value)}
            className="rounded-full"
          >
            {day.label}
          </Button>
        ))}
      </div>

      <div className="grid max-w-md grid-cols-3 gap-3">
        <label className="font-medium text-sm">
          Abre (h)
          <Input
            type="number"
            min="0"
            max="23"
            value={draft.startHour}
            onChange={(e) =>
              setDraft({ ...draft, startHour: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Fecha (h)
          <Input
            type="number"
            min="1"
            max="24"
            value={draft.endHour}
            onChange={(e) =>
              setDraft({ ...draft, endHour: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Intervalo (min)
          <Input
            type="number"
            min="15"
            max="120"
            value={draft.minGapMinutes}
            onChange={(e) =>
              setDraft({ ...draft, minGapMinutes: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
      </div>

      <LunchBreakFields
        value={draft.lunchBreak ?? null}
        onChange={(lunchBreak) => setDraft({ ...draft, lunchBreak })}
      />
      <CancellationPolicyFields
        value={draft.cancellationPolicy}
        onChange={(cancellationPolicy) =>
          setDraft({ ...draft, cancellationPolicy })
        }
      />

      <Button
        type="button"
        onClick={() => void save()}
        variant="accent"
        className="mt-4"
      >
        Salvar grade
      </Button>
    </Card>
  );
}
