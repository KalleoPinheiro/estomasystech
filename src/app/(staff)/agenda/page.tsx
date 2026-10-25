'use client';

import {
  Alert,
  AlertDescription,
  Button,
  NativeSelect,
} from '@still-void/ui/react';
import { useMediaQuery, useToast } from '@still-void/ui/react/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHydrated } from '@/components/app-shell/use-hydrated';
import { LoadingIndicator } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import {
  parseStatusFilter,
  serializeStatusFilter,
  toggleStatus,
} from '@/domain/scheduling/appointment-status-filter';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { apiFetch } from '@/lib/client';
import { cellStart, clinicDayCell, clinicInstant } from '@/lib/clinic-calendar';
import type {
  AppointmentDto,
  ProfessionalOptionDto,
  ScheduleClosureDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { useAgendaPeriod } from './agenda-period';
import { type ActionExtras, AppointmentDetail } from './appointment-detail';
import {
  AppointmentForm,
  type AppointmentFormValues,
} from './appointment-form';
import { CalendarGrid } from './calendar-grid';
import { PeriodNav } from './period-nav';
import { StatusFilter } from './status-filter';
import { WaitlistPanel } from './waitlist-panel';
import { WeekView } from './week-view';

function ProfessionalFilter({
  professionals,
  value,
  onChange,
  compact,
}: {
  professionals: ProfessionalOptionDto[];
  value: string;
  onChange: (value: string) => void;
  /** Celular: largura total abaixo da navegação de mês; desktop: largura limitada (AGENDA-04). */
  compact: boolean;
}) {
  if (professionals.length === 0) {
    return null;
  }
  return (
    <NativeSelect
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrar por profissional"
      data-professional-filter
      className={compact ? 'w-full' : 'max-w-56'}
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
  seriesNotice,
  onDismissSeriesNotice,
}: {
  seriesNotice: { text: string; variant: 'success' | 'warning' } | null;
  onDismissSeriesNotice: () => void;
}) {
  return (
    <>
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

/**
 * Falha da busca das consultas ou da contagem (#578): fica no lugar da grade,
 * que só desenha o dado da URL corrente, e refaz as duas buscas.
 */
function LoadFailedAlert({
  detail,
  onRetry,
}: {
  detail: string | null;
  onRetry: () => void;
}) {
  return (
    <Alert
      variant="danger"
      className="mb-4"
      action={
        <Button type="button" variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      }
    >
      <AlertDescription>
        <span className="block">Não foi possível carregar as consultas.</span>
        {detail && <span className="block text-sm">{detail}</span>}
      </AlertDescription>
    </Alert>
  );
}

/** Primeiro dia aceito pela entrada, nunca antes de hoje. */
function waitlistStartDay(fromDate: string): Date {
  const [year, month, day] = fromDate.split('-').map(Number);
  const from = new Date(year, month - 1, day);
  const today = clinicDayCell();
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

/**
 * Link do evento no Google Agenda (#217): `?consulta=<id>&em=<início ISO>` abre
 * o mês da consulta e os detalhes dela. `em` inválido é ignorado.
 */
function readConsultationLink() {
  if (typeof window === 'undefined') {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const id = params.get('consulta');
  const startsAt = new Date(params.get('em') ?? '');
  return id && !Number.isNaN(startsAt.getTime()) ? { id, startsAt } : null;
}

/**
 * Filtro de status na URL (`?status=`, AGE-FLT-04): o link compartilhado e o
 * recarregar mantêm o recorte, e a URL é a única fonte da seleção (sem estado
 * local espelhado): navegar para `/agenda` sem parâmetros volta ao padrão.
 */
function useStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get('status');
  const statuses = useMemo(() => parseStatusFilter(raw), [raw]);
  const setStatuses = useCallback(
    (next: readonly AppointmentStatus[]) => {
      const params = new URLSearchParams(searchParams.toString());
      const value = serializeStatusFilter(next);
      if (value === null) {
        params.delete('status');
      } else {
        params.set('status', value);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
  return { statuses, setStatuses };
}

export default function AgendaPage() {
  // Abaixo de `md` a grade de 7 colunas com chips não cabe: vira mês compacto.
  const compact = useMediaQuery('(max-width: 767px)');
  const { toast } = useToast();
  const hydrated = useHydrated();
  const [consultationLink] = useState(readConsultationLink);
  const period = useAgendaPeriod(consultationLink?.startsAt ?? new Date());
  const [recall] = useState(readRecallParams);
  const [creatingFor, setCreatingFor] = useState<Date | null>(() =>
    readRecallParams() ? clinicDayCell() : null,
  );
  const [selected, setSelected] = useState<AppointmentDto | null>(null);
  // Entrada da lista de espera sendo agendada pelo formulário de consulta.
  const [fromWaitlist, setFromWaitlist] = useState<WaitlistEntryDto | null>(
    null,
  );
  const [waitlistVersion, setWaitlistVersion] = useState(0);
  const [professionalFilter, setProfessionalFilter] = useState('');
  const { statuses, setStatuses } = useStatusFilter();

  const [linkOpened, setLinkOpened] = useState(false);

  const periodQuery = useMemo(() => {
    const filter = professionalFilter
      ? `&professionalId=${encodeURIComponent(professionalFilter)}`
      : '';
    return `from=${cellStart(period.from).toISOString()}&to=${cellStart(period.to).toISOString()}${filter}`;
  }, [period.from, period.to, professionalFilter]);
  // O filtro vai ao servidor (AGE-FLT-03); `status=` vazio pede nenhum status.
  const appointmentsUrl = `/api/appointments?${periodQuery}&status=${statuses.join(',')}`;
  const {
    data: statusCounts,
    error: countsError,
    refresh: refreshCounts,
  } = useApiQuery<Record<AppointmentStatus, number>>(
    `/api/appointments/status-counts?${periodQuery}`,
  );

  const {
    data: appointments,
    error,
    refresh: refreshAppointments,
  } = useApiQuery<AppointmentDto[]>(appointmentsUrl);
  const refresh = () => {
    refreshAppointments();
    refreshCounts();
  };
  useEffect(() => {
    if (!consultationLink || linkOpened || !appointments) {
      return;
    }
    setLinkOpened(true);
    const target = appointments.find((a) => a.id === consultationLink.id);
    if (target) {
      setSelected(target);
    }
  }, [appointments, consultationLink, linkOpened]);
  // Lista reduzida (#188): Atendente e Profissional também leem — sem comissão.
  const { data: professionals, error: professionalsError } = useApiQuery<
    ProfessionalOptionDto[]
  >('/api/options/professionals');
  const { data: scheduleData } = useApiQuery<{
    config: ScheduleConfig;
    isDefault: boolean;
  }>('/api/schedule-config');
  const scheduleConfig = resolveScheduleConfig(scheduleData);
  const closuresUrl = `/api/settings/schedule/closures?from=${period.closuresFrom}&to=${period.closuresTo}`;
  const professionalName = (id: string) =>
    professionals?.find((p) => p.id === id)?.fullName ?? 'Profissional';
  const { data: closures } = useApiQuery<ScheduleClosureDto[]>(closuresUrl);

  const [seriesNotice, setSeriesNotice] = useState<{
    text: string;
    variant: 'success' | 'warning';
  } | null>(null);

  const handleCreate = async (values: AppointmentFormValues) => {
    const startsAt = clinicInstant(values.date, values.startTime);
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
              result.skipped.map((s) => formatDate(s.startsAt)).join(', ')
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
      <PageHeader
        title="Agenda"
        actions={
          <Button
            type="button"
            onClick={() => setCreatingFor(clinicDayCell())}
            // Antes da hidratação o clique se perderia (#484): o botão fica
            // desabilitado até responder.
            disabled={!hydrated}
            variant="accent"
          >
            + Nova consulta
          </Button>
        }
      />

      <AgendaNotices
        seriesNotice={seriesNotice}
        onDismissSeriesNotice={() => setSeriesNotice(null)}
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <PeriodNav period={period} showViewToggle={!compact} />
        <ProfessionalFilter
          professionals={professionals ?? []}
          value={professionalFilter}
          onChange={setProfessionalFilter}
          compact={compact}
        />
      </div>

      <StatusFilter
        selected={statuses}
        counts={statusCounts}
        unavailable={countsError !== null}
        onToggle={(status) => setStatuses(toggleStatus(statuses, status))}
      />

      {(error || countsError) && statuses.length > 0 && (
        <LoadFailedAlert detail={error ?? countsError} onRetry={refresh} />
      )}

      {statuses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-ink-3 text-sm">
          <p>Nenhum status marcado.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setStatuses(parseStatusFilter(null))}
          >
            Mostrar padrão
          </Button>
        </div>
      ) : error ? null : !appointments ? (
        <LoadingIndicator />
      ) : period.view !== 'month' && !compact ? (
        <WeekView
          weekStart={period.view === 'day' ? period.dayDate : period.weekStart}
          dayCount={period.view === 'day' ? 1 : 7}
          appointments={appointments}
          scheduleConfig={scheduleConfig}
          closures={closures ?? []}
          professionalName={professionalName}
          showCancelled={statuses.includes('cancelled')}
          onDayClick={(day) => setCreatingFor(day)}
          onAppointmentClick={setSelected}
        />
      ) : (
        <CalendarGrid
          monthDate={period.monthDate}
          appointments={appointments}
          scheduleConfig={scheduleConfig}
          closures={closures ?? []}
          professionalName={professionalName}
          compact={compact}
          showCancelled={statuses.includes('cancelled')}
          onDayClick={(day) => setCreatingFor(day)}
          onAppointmentClick={setSelected}
        />
      )}

      <WaitlistPanel
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
            professionals={(professionals ?? []).filter((p) => p.active)}
            professionalsError={professionalsError}
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
