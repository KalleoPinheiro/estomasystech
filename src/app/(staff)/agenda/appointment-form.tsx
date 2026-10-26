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
import { clinicDayCell } from '@/lib/clinic-calendar';
import type { ProcedureOptionDto, ProfessionalOptionDto } from '@/lib/dto';
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
  professionals?: ProfessionalOptionDto[];
  /** Falha ao carregar a lista de profissionais — vira alerta, nunca campo escondido (#188). */
  professionalsError?: string | null;
  /** Grade já lida pela página; sem ela o formulário a busca. */
  scheduleConfig?: ScheduleConfig;
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
  professionalsError = null,
  scheduleConfig: scheduleConfigProp,
  defaultDate,
  defaultPatientId,
  defaultProcedure,
  onSubmit,
}: AppointmentFormProps) {
  const [values, setValues] = useState<AppointmentFormValues>({
    patientId: defaultPatientId ?? '',
    date: defaultDate ? dayKey(defaultDate) : dayKey(clinicDayCell()),
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

  const { data: catalog, error: catalogError } = useApiQuery<
    ProcedureOptionDto[]
  >('/api/options/procedures');
  const activeCatalog = (catalog ?? []).filter((p) => p.active);
  // A página já leu a grade no servidor (#551): só busca quando o formulário
  // é usado sem ela.
  const { data: scheduleData } = useApiQuery<{ config: ScheduleConfig }>(
    scheduleConfigProp ? null : '/api/schedule-config',
  );
  const scheduleConfig =
    scheduleConfigProp ?? resolveScheduleConfig(scheduleData);

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
      {/* Com erro de regra na tela, a faixa de erro já traz o horário: evita a mensagem em dobro (#478). */}
      {!error && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-accent-ink text-xs">
          Atendimento de {describeSchedule(scheduleConfig)}, com intervalo
          mínimo de {scheduleConfig.minGapMinutes} minutos entre consultas.
        </p>
      )}
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
      <ProfessionalField
        professionals={professionals}
        error={professionalsError}
        value={values.professionalId}
        onChange={(professionalId) =>
          setValues((prev) => ({ ...prev, professionalId }))
        }
      />
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
      <CatalogField
        catalog={activeCatalog}
        error={catalogError}
        value={values.procedureId}
        onChange={applyCatalogProcedure}
      />

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

/**
 * Lista auxiliar que falhou vira alerta com o motivo — antes o campo sumia em
 * silêncio e a consulta nascia sem profissional (#188).
 */
function ProfessionalField({
  professionals,
  error,
  value,
  onChange,
}: {
  professionals: ProfessionalOptionDto[];
  error: string | null;
  value: string;
  onChange: (professionalId: string) => void;
}) {
  if (error) {
    return (
      <ErrorAlert
        message={`Não foi possível carregar os profissionais: ${error}`}
      />
    );
  }
  if (professionals.length === 0) {
    return null;
  }
  return (
    <label className="font-medium text-sm">
      Profissional
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  );
}

function CatalogField({
  catalog,
  error,
  value,
  onChange,
}: {
  catalog: ProcedureOptionDto[];
  error: string | null;
  value: string;
  onChange: (procedureId: string) => void;
}) {
  if (error) {
    return (
      <ErrorAlert
        message={`Não foi possível carregar o catálogo de procedimentos: ${error}`}
      />
    );
  }
  if (catalog.length === 0) {
    return null;
  }
  return (
    <label className="font-medium text-sm">
      Procedimento do catálogo
      <NativeSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      >
        <option value="">— escolher do catálogo —</option>
        {catalog.map((procedure) => (
          <option key={procedure.id} value={procedure.id}>
            {procedure.name} ({procedure.durationMinutes} min)
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
