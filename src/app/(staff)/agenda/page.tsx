'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Icon,
  NativeSelect,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useMemo, useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { Modal } from '@/components/modal';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { apiFetch } from '@/lib/client';
import type {
  AppointmentDto,
  PatientDto,
  ProfessionalDto,
  ScheduleClosureDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { type ActionExtras, AppointmentDetail } from './appointment-detail';
import {
  AppointmentForm,
  type AppointmentFormValues,
} from './appointment-form';
import { CalendarGrid, dayKey } from './calendar-grid';
import { WaitlistPanel } from './waitlist-panel';

function ProfessionalFilter({
  professionals,
  value,
  onChange,
}: {
  professionals: ProfessionalDto[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (professionals.length === 0) {
    return null;
  }
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-56"
    >
      <option value="">Todos os profissionais</option>
      {professionals.map((professional) => (
        <option key={professional.id} value={professional.id}>
          {professional.fullName}
        </option>
      ))}
    </NativeSelect>
  );
}

function AgendaNotices({
  error,
  seriesNotice,
  onDismissSeriesNotice,
}: {
  error: string | null;
  seriesNotice: { text: string; variant: 'success' | 'warning' } | null;
  onDismissSeriesNotice: () => void;
}) {
  return (
    <>
      {error && <ErrorAlert message={error} />}
      {seriesNotice && (
        <Alert
          variant={seriesNotice.variant}
          className="mb-4"
          action={
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={onDismissSeriesNotice}
            >
              Dispensar
            </Button>
          }
        >
          <AlertDescription>{seriesNotice.text}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

/** Só a primeira letra maiúscula ("Agosto de 2026") — a classe Tailwind
 * `capitalize` maiusculiza cada palavra, incluindo a preposição "de". */
const monthLabel = (date: Date): string => {
  const raw = date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/** Primeiro dia aceito pela entrada, nunca antes de hoje. */
function waitlistStartDay(fromDate: string): Date {
  const [year, month, day] = fromDate.split('-').map(Number);
  const from = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return from < today ? today : from;
}

function resolveScheduleConfig(
  data: { config: ScheduleConfig } | null,
): ScheduleConfig {
  return data?.config ?? DEFAULT_SCHEDULE_CONFIG;
}

/** Parâmetros do recall de 1 clique (?followUpId&patientId&procedure). */
function readRecallParams() {
  if (typeof window === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const followUpId = params.get('followUpId');
  return followUpId
    ? {
        followUpId,
        patientId: params.get('patientId') ?? '',
        procedure: params.get('procedure') ?? '',
      }
    : null;
}

export default function AgendaPage() {
  const { toast } = useToast();
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [recall] = useState(readRecallParams);
  const [creatingFor, setCreatingFor] = useState<Date | null>(() =>
    readRecallParams() ? new Date() : null,
  );
  const [selected, setSelected] = useState<AppointmentDto | null>(null);
  // Entrada da lista de espera sendo agendada pelo formulário de consulta.
  const [fromWaitlist, setFromWaitlist] = useState<WaitlistEntryDto | null>(
    null,
  );
  const [waitlistVersion, setWaitlistVersion] = useState(0);
  const [professionalFilter, setProfessionalFilter] = useState('');

  const appointmentsUrl = useMemo(() => {
    const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    const filter = professionalFilter
      ? `&professionalId=${encodeURIComponent(professionalFilter)}`
      : '';
    return `/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}${filter}`;
  }, [monthDate, professionalFilter]);

  const {
    data: appointments,
    error,
    refresh,
  } = useApiQuery<AppointmentDto[]>(appointmentsUrl);
  const { data: patients } = useApiQuery<PatientDto[]>('/api/patients');
  const { data: professionals } =
    useApiQuery<ProfessionalDto[]>('/api/professionals');
  const { data: scheduleData } = useApiQuery<{
    config: ScheduleConfig;
    isDefault: boolean;
  }>('/api/settings/schedule');
  const scheduleConfig = resolveScheduleConfig(scheduleData);
  // Grade do mês mostra até 6 dias do mês vizinho de cada lado.
  const closuresUrl = useMemo(() => {
    const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), -6);
    const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 7);
    return `/api/settings/schedule/closures?from=${dayKey(from)}&to=${dayKey(to)}`;
  }, [monthDate]);
  const { data: closures } = useApiQuery<ScheduleClosureDto[]>(closuresUrl);

  const changeMonth = (delta: number) =>
    setMonthDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );

  const [seriesNotice, setSeriesNotice] = useState<{
    text: string;
    variant: 'success' | 'warning';
  } | null>(null);

  const handleCreate = async (values: AppointmentFormValues) => {
    const startsAt = new Date(`${values.date}T${values.startTime}:00`);
    const endsAt = new Date(
      startsAt.getTime() + values.durationMinutes * 60_000,
    );
    const payload = {
      patientId: values.patientId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      procedure: values.procedure,
      priceCents: Math.round(Number(values.price) * 100),
      notes: values.notes || null,
      professionalId: values.professionalId || null,
      procedureId: values.procedureId || null,
    };
    if (values.occurrences > 1) {
      const result = await apiFetch<{
        created: AppointmentDto[];
        skipped: Array<{ startsAt: string; reason: string }>;
      }>('/api/appointments/recurring', {
        method: 'POST',
        body: JSON.stringify({ ...payload, occurrences: values.occurrences }),
      });
      setSeriesNotice({
        text:
          result.skipped.length > 0
            ? `Série criada: ${result.created.length} sessão(ões); ${result.skipped.length} pulada(s) — ` +
              result.skipped
                .map((s) => new Date(s.startsAt).toLocaleDateString('pt-BR'))
                .join(', ')
            : `Série criada: ${result.created.length} sessões.`,
        variant: result.skipped.length > 0 ? 'warning' : 'success',
      });
      setCreatingFor(null);
      refresh();
    } else {
      // Sem try/catch aqui de propósito: AppointmentForm já envolve este
      // onSubmit no próprio catch (mostra ErrorAlert inline e mantém o modal
      // aberto) — interceptar o erro aqui engoliria essa mensagem antes dela
      // chegar lá (ex.: "Horário indisponível", "fora da grade").
      await apiFetch<AppointmentDto>('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          followUpId: recall?.followUpId ?? null,
        }),
      });
      toast({
        description: 'Consulta criada',
        variant: 'success',
      });
      if (fromWaitlist) {
        await resolveWaitlistEntry(fromWaitlist);
      }
      setSeriesNotice(null);
      setCreatingFor(null);
      refresh();
    }
  };

  // Consulta marcada a partir da fila: a entrada sai da lista de espera.
  const resolveWaitlistEntry = async (entry: WaitlistEntryDto) => {
    try {
      await apiFetch(`/api/waitlist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ resolution: 'scheduled' }),
      });
    } catch {
      toast({
        description:
          'Consulta criada, mas não foi possível tirar o paciente da lista de espera.',
        variant: 'danger',
      });
    }
    setFromWaitlist(null);
    setWaitlistVersion((v) => v + 1);
  };

  const handleAction = async (
    action: 'confirm' | 'cancel' | 'no_show' | 'complete',
    followUpInDays?: number | null,
    extras?: ActionExtras,
  ) => {
    if (!selected) return;
    const result = await apiFetch<
      AppointmentDto & {
        feeInvoiceId?: string | null;
        waitlistMatches?: number;
      }
    >(`/api/appointments/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify(
        action === 'complete'
          ? { action, followUpInDays: followUpInDays ?? null }
          : { action, ...extras },
      ),
    });
    setSelected(null);
    refresh();
    announceAbsence(result);
  };

  // Depois de cancelar/registrar falta: taxa lançada e quem espera por vaga.
  const announceAbsence = (result: {
    feeInvoiceId?: string | null;
    waitlistMatches?: number;
  }) => {
    if (result.feeInvoiceId) {
      toast({
        description: 'Taxa lançada como fatura pendente em Faturamento.',
        variant: 'success',
      });
    }
    if (result.waitlistMatches) {
      toast({
        description: `Horário liberado: ${result.waitlistMatches} na lista de espera aceita${result.waitlistMatches === 1 ? '' : 'm'} esse dia.`,
        variant: 'info',
      });
    }
  };

  const handleReschedule = async (startsAt: Date, endsAt: Date) => {
    if (!selected) return;
    await apiFetch<AppointmentDto>(`/api/appointments/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'reschedule',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      }),
    });
    setSelected(null);
    refresh();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="sv-display font-bold text-2xl">Agenda</h1>
        <Button
          type="button"
          onClick={() => setCreatingFor(new Date())}
          variant="accent"
        >
          + Nova consulta
        </Button>
      </div>

      <AgendaNotices
        error={error}
        seriesNotice={seriesNotice}
        onDismissSeriesNotice={() => setSeriesNotice(null)}
      />

      <div className="mb-4 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Mês anterior"
          variant="outline"
          className="hover:bg-surface-2"
        >
          <Icon name="chevron-left" />
        </Button>
        <span className="min-w-48 text-center font-semibold text-lg">
          {monthLabel(monthDate)}
        </span>
        <Button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Próximo mês"
          variant="outline"
          className="hover:bg-surface-2"
        >
          <Icon name="chevron-right" />
        </Button>
        <ProfessionalFilter
          professionals={professionals ?? []}
          value={professionalFilter}
          onChange={setProfessionalFilter}
        />
      </div>

      {!appointments ? (
        <LoadingIndicator />
      ) : (
        <CalendarGrid
          monthDate={monthDate}
          appointments={appointments}
          scheduleConfig={scheduleConfig}
          closures={closures ?? []}
          professionalName={(id) =>
            professionals?.find((p) => p.id === id)?.fullName ?? 'Profissional'
          }
          onDayClick={(day) => setCreatingFor(day)}
          onAppointmentClick={setSelected}
        />
      )}

      <WaitlistPanel
        patients={patients ?? []}
        professionals={professionals ?? []}
        version={waitlistVersion}
        onSchedule={(entry) => {
          setFromWaitlist(entry);
          setCreatingFor(waitlistStartDay(entry.fromDate));
        }}
      />

      {creatingFor && (
        <Modal
          title="Nova consulta"
          onClose={() => {
            setCreatingFor(null);
            setFromWaitlist(null);
          }}
        >
          <AppointmentForm
            patients={patients ?? []}
            professionals={(professionals ?? []).filter((p) => p.active)}
            defaultDate={creatingFor}
            defaultPatientId={fromWaitlist?.patientId ?? recall?.patientId}
            defaultProcedure={
              fromWaitlist?.procedureName ?? recall?.procedure ?? undefined
            }
            onSubmit={handleCreate}
          />
        </Modal>
      )}

      {selected && (
        <Modal title="Detalhes da consulta" onClose={() => setSelected(null)}>
          <AppointmentDetail
            appointment={selected}
            cancellationPolicy={scheduleConfig.cancellationPolicy}
            onAction={handleAction}
            onReschedule={handleReschedule}
          />
        </Modal>
      )}
    </div>
  );
}
