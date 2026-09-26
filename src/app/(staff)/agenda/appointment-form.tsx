'use client';

import { Button, Input, NativeSelect, Textarea } from '@still-void/ui/react';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { PatientPicker } from '@/components/patient-picker';
import {
  DEFAULT_SCHEDULE_CONFIG,
  describeSchedule,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { ApiError } from '@/lib/client';
import type { ProcedureDto, ProfessionalDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { dayKey } from './calendar-grid';

export interface AppointmentFormValues {
  patientId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  procedure: string;
  price: string;
  notes: string;
  professionalId: string;
  procedureId: string;
  /** 1 = consulta única; >1 = série semanal com N ocorrências. */
  occurrences: number;
}

interface AppointmentFormProps {
  professionals?: ProfessionalDto[];
  defaultDate?: Date;
  defaultPatientId?: string;
  defaultProcedure?: string;
  onSubmit: (values: AppointmentFormValues) => Promise<void>;
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120];

/** 409 (conflito de horário) é `warning`, o resto (400 etc.) continua `danger` (AGENDA-05). */
function resolveSubmitError(err: unknown): {
  message: string;
  variant: 'danger' | 'warning';
} {
  const message =
    err instanceof Error ? err.message : 'Erro ao agendar consulta';
  const variant =
    err instanceof ApiError && err.status === 409 ? 'warning' : 'danger';
  return { message, variant };
}

function resolveScheduleConfig(
  data: { config: ScheduleConfig } | null,
): ScheduleConfig {
  return data?.config ?? DEFAULT_SCHEDULE_CONFIG;
}

export function AppointmentForm({
  professionals = [],
  defaultDate,
  defaultPatientId,
  defaultProcedure,
  onSubmit,
}: AppointmentFormProps) {
  const [values, setValues] = useState<AppointmentFormValues>({
    patientId: defaultPatientId ?? '',
    date: defaultDate ? dayKey(defaultDate) : dayKey(new Date()),
    startTime: '09:00',
    durationMinutes: 60,
    procedure: defaultProcedure ?? '',
    price: '',
    notes: '',
    professionalId: '',
    procedureId: '',
    occurrences: 1,
  });
  const [error, setError] = useState<string | null>(null);
  const [errorVariant, setErrorVariant] = useState<'danger' | 'warning'>(
    'danger',
  );
  const [saving, setSaving] = useState(false);

  const { data: catalog } = useApiQuery<ProcedureDto[]>('/api/procedures');
  const activeCatalog = (catalog ?? []).filter((p) => p.active);
  const { data: scheduleData } = useApiQuery<{ config: ScheduleConfig }>(
    '/api/settings/schedule',
  );
  const scheduleConfig = resolveScheduleConfig(scheduleData);

  // Selecionar do catálogo preenche nome, preço e duração (editáveis depois).
  const applyCatalogProcedure = (procedureId: string) => {
    const selected = activeCatalog.find((p) => p.id === procedureId);
    setValues((prev) => ({
      ...prev,
      procedureId,
      procedure: selected ? selected.name : prev.procedure,
      price: selected ? String(selected.priceCents / 100) : prev.price,
      durationMinutes: selected
        ? selected.durationMinutes
        : prev.durationMinutes,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorVariant('danger');
    if (!values.patientId) {
      setError('Selecione o paciente');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      const resolved = resolveSubmitError(err);
      setErrorVariant(resolved.variant);
      setError(resolved.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} variant={errorVariant} />}
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-accent-ink text-xs">
        Atendimento de {describeSchedule(scheduleConfig)}, com intervalo mínimo
        de {scheduleConfig.minGapMinutes} minutos entre consultas.
      </p>
      <PatientPicker
        label="Paciente *"
        value={values.patientId}
        onChange={(patientId) => setValues((prev) => ({ ...prev, patientId }))}
      />
      <label className="font-medium text-sm">
        Repetição
        <NativeSelect
          value={values.occurrences}
          onChange={(e) =>
            setValues((prev) => ({
              ...prev,
              occurrences: Number(e.target.value),
            }))
          }
          className="mt-1"
        >
          <option value={1}>Consulta única</option>
          {[4, 6, 8, 10, 12].map((n) => (
            <option key={n} value={n}>
              Semanal — {n} sessões
            </option>
          ))}
        </NativeSelect>
      </label>
      {professionals.length > 0 && (
        <label className="font-medium text-sm">
          Profissional
          <NativeSelect
            value={values.professionalId}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, professionalId: e.target.value }))
            }
            className="mt-1"
          >
            <option value="">— sem atribuição —</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.fullName}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <div className="grid grid-cols-3 gap-3">
        <label className="font-medium text-sm">
          Data *
          <Input
            required
            type="date"
            value={values.date}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, date: e.target.value }))
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Início *
          <Input
            required
            type="time"
            value={values.startTime}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, startTime: e.target.value }))
            }
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Duração *
          <NativeSelect
            value={values.durationMinutes}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                durationMinutes: Number(e.target.value),
              }))
            }
            className="mt-1"
          >
            {DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {activeCatalog.length > 0 && (
        <label className="font-medium text-sm">
          Procedimento do catálogo
          <NativeSelect
            value={values.procedureId}
            onChange={(e) => applyCatalogProcedure(e.target.value)}
            className="mt-1"
          >
            <option value="">— escolher do catálogo —</option>
            {activeCatalog.map((procedure) => (
              <option key={procedure.id} value={procedure.id}>
                {procedure.name} ({procedure.durationMinutes} min)
              </option>
            ))}
          </NativeSelect>
        </label>
      )}

      <label className="font-medium text-sm">
        Procedimento *
        <Input
          required
          value={values.procedure}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, procedure: e.target.value }))
          }
          placeholder="Ex.: Troca de bolsa de colostomia"
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Valor (R$) *
        <Input
          required
          type="number"
          min="0"
          step="0.01"
          value={values.price}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, price: e.target.value }))
          }
          className="mt-1"
        />
      </label>
      <label className="font-medium text-sm">
        Observações
        <Textarea
          rows={2}
          value={values.notes}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, notes: e.target.value }))
          }
          className="mt-1"
        />
      </label>
      <Button type="submit" disabled={saving} variant="accent" className="mt-2">
        {saving ? 'Agendando…' : 'Agendar consulta'}
      </Button>
    </form>
  );
}
