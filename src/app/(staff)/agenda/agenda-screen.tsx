'use client';

import {
  Alert,
  AlertDescription,
  Button,
  NativeSelect,
} from '@still-void/ui/react';
import { useMediaQuery, useToast } from '@still-void/ui/react/client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useHydrated } from '@/components/app-shell/use-hydrated';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import {
  parseStatusFilter,
  toggleStatus,
} from '@/domain/scheduling/appointment-status-filter';
import type { ScheduleConfig } from '@/domain/scheduling/schedule-config';
import { apiFetch } from '@/lib/client';
import { clinicDayCell, clinicInstant } from '@/lib/clinic-calendar';
import type {
  AppointmentDto,
  ProfessionalOptionDto,
  ScheduleClosureDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { useAgendaPeriod } from './agenda-period';
import type { AgendaEntry, AgendaQuery } from './agenda-range';
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
}: {
  professionals: ProfessionalOptionDto[];
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
      aria-label="Filtrar por profissional"
      data-professional-filter
      // Celular: largura total abaixo da navegação de mês; desktop: largura
      // limitada (AGENDA-04). Por CSS, para o servidor já desenhar certo.
      className="w-full md:max-w-56"
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
 * Falha da leitura das consultas ou da contagem (#578): fica no lugar da grade,
 * que só desenha o dado da URL corrente, e refaz a leitura no servidor.
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

/** Consulta do link do Google Agenda (#217): abre os detalhes dela se estiver no período. */
function linkedAppointment(
  appointments: AppointmentDto[] | null,
  entry: AgendaEntry,
): AppointmentDto | null {
  const id = entry.consultation?.id;
  return (id && appointments?.find((a) => a.id === id)) || null;
}

export interface AgendaScreenProps {
  /** Recorte da URL: visão, dia, status e profissional. */
  query: AgendaQuery;
  /** Recall de 1 clique e link do Google Agenda (parâmetros da URL). */
  entry: AgendaEntry;
  /** Consultas do período; `null` quando a leitura falhou. */
  appointments: AppointmentDto[] | null;
  appointmentsError: string | null;
  /** Contagem por status do período; `null` quando a leitura falhou. */
  statusCounts: Record<AppointmentStatus, number> | null;
  countsError: string | null;
  professionals: ProfessionalOptionDto[];
  professionalsError: string | null;
  scheduleConfig: ScheduleConfig;
  closures: ScheduleClosureDto[];
  waitlist: WaitlistEntryDto[] | null;
  waitlistError: string | null;
}

/**
 * Tela da agenda no cliente (#551): recebe do servidor tudo o que a carga
 * precisa (consultas, contagem, grade, feriados, profissionais, fila) e cuida
 * só do que é interação: navegar o período, abrir os formulários e gravar. Cada
 * mudança de período ou de filtro vira navegação (a URL é a fonte da verdade) e
 * cada gravação termina em `router.refresh()`.
 */
export function AgendaScreen({
  query,
  entry,
  appointments,
  appointmentsError,
  statusCounts,
  countsError,
  professionals,
  professionalsError,
  scheduleConfig,
  closures,
  waitlist,
  waitlistError,
}: AgendaScreenProps) {
  // Abaixo de `md` a grade de 7 colunas com chips não cabe: vira mês compacto.
  // Antes da hidratação o servidor não sabe a largura: desenha as duas
  // versões do mês e o CSS esconde a que não serve (sem salto, #551).
  const hydrated = useHydrated();
  const compact = useMediaQuery('(max-width: 767px)') && hydrated;
  const { toast } = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const period = useAgendaPeriod(query);
  const { statuses } = query;
  // Girar/encolher a janela com a semana aberta: o celular não tem 7 colunas.
  useEffect(() => {
    if (compact && period.view === 'week') {
      period.setView('day', { replace: true });
    }
  }, [compact, period]);
  const [creatingFor, setCreatingFor] = useState<Date | null>(() =>
    entry.recall ? clinicDayCell() : null,
  );
  const [selected, setSelected] = useState<AppointmentDto | null>(() =>
    linkedAppointment(appointments, entry),
  );
  // Entrada da lista de espera sendo agendada pelo formulário de consulta.
  const [fromWaitlist, setFromWaitlist] = useState<WaitlistEntryDto | null>(
    null,
  );
  const professionalName = (id: string) =>
    professionals.find((p) => p.id === id)?.fullName ?? 'Profissional';

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
          followUpId: entry.recall?.followUpId ?? null,
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
  const resolveWaitlistEntry = async (waiting: WaitlistEntryDto) => {
    try {
      await apiFetch(`/api/waitlist/${waiting.id}`, {
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

  const showCancelled = statuses.includes('cancelled');
  const month = period.view === 'month';

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
        <PeriodNav period={period} compact={compact} />
        <ProfessionalFilter
          professionals={professionals}
          value={query.professionalId}
          onChange={(professionalId) =>
            period.navigate({ professionalId }, { replace: true })
          }
        />
      </div>

      <StatusFilter
        selected={statuses}
        counts={statusCounts}
        unavailable={countsError !== null}
        onToggle={(status) =>
          period.navigate(
            (latest) => ({ statuses: toggleStatus(latest.statuses, status) }),
            { replace: true },
          )
        }
      />

      {(appointmentsError || countsError) && statuses.length > 0 && (
        <LoadFailedAlert
          detail={appointmentsError ?? countsError}
          onRetry={refresh}
        />
      )}

      {/* Navegando: o recorte novo ainda não chegou, então a tela segue no lugar,
          marcada como ocupada; semana e dia esvaziam as colunas para não mostrar
          consultas de outro período sob o rótulo novo (#588). */}
      <div
        aria-busy={(period.pending && month) || undefined}
        className={period.pending && month ? 'opacity-60' : undefined}
      >
        {statuses.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-ink-3 text-sm">
            <p>Nenhum status marcado.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                period.navigate(
                  { statuses: parseStatusFilter(null) },
                  { replace: true },
                )
              }
            >
              Mostrar padrão
            </Button>
          </div>
        ) : appointmentsError ? null : !month ? (
          <WeekView
            weekStart={
              period.view === 'day' ? period.dayDate : period.weekStart
            }
            dayCount={period.view === 'day' ? 1 : 7}
            appointments={period.pending ? [] : (appointments ?? [])}
            loading={period.pending}
            scheduleConfig={scheduleConfig}
            closures={closures}
            professionalName={professionalName}
            showCancelled={showCancelled}
            onDayClick={(day) => setCreatingFor(day)}
            onAppointmentClick={setSelected}
          />
        ) : (
          <CalendarGrid
            monthDate={period.monthDate}
            appointments={appointments ?? []}
            scheduleConfig={scheduleConfig}
            closures={closures}
            professionalName={professionalName}
            compact={compact}
            bothLayouts={!hydrated}
            onSelectDay={period.chooseDay}
            showCancelled={showCancelled}
            onDayClick={(day) => setCreatingFor(day)}
            onAppointmentClick={setSelected}
          />
        )}
      </div>

      <WaitlistPanel
        professionals={professionals}
        entries={waitlist}
        error={waitlistError}
        onSchedule={(waiting) => {
          setFromWaitlist(waiting);
          setCreatingFor(waitlistStartDay(waiting.fromDate));
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
            professionals={professionals.filter((p) => p.active)}
            professionalsError={professionalsError}
            scheduleConfig={scheduleConfig}
            defaultDate={creatingFor}
            defaultPatientId={
              fromWaitlist?.patientId ?? entry.recall?.patientId
            }
            defaultProcedure={
              fromWaitlist?.procedureName ??
              entry.recall?.procedure ??
              undefined
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
