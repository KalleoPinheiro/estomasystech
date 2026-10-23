'use client';

import { Badge, Button, Card, Icon } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import Link from 'next/link';
import { useState } from 'react';
import type { BillingSummary } from '@/application/billing/get-billing-summary';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { SummaryCard } from '@/components/summary-card';
import { TriagePhotoList } from '@/components/triage-photo-list';
import { WhatsAppReminderButton } from '@/components/whatsapp-reminder-button';
import { GUARDIAN_MANAGER_ROLES } from '@/lib/auth/guardian-access';
import { apiFetch } from '@/lib/client';
import { dayCounts, nextAppointment, pendingClosure } from '@/lib/day-summary';
import type { AppointmentDto, FollowUpDto, SupplyDto } from '@/lib/dto';
import {
  APPOINTMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatTime,
} from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';
import { useTriageQueue } from '@/lib/use-triage-queue';
import { MajorityReviewCard } from './majority-review-card';

interface SummaryData {
  billing: BillingSummary;
  appointmentsInMonth: number;
  today: AppointmentDto[];
}

/** Janela dos últimos 30 dias até agora — onde procurar consulta sem desfecho. */
function closurePendingRange(): string {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return `from=${start.toISOString()}&to=${end.toISOString()}`;
}

/** Início e fim do dia local — janela de "Consultas de hoje" sem o resumo. */
function todayRange(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `from=${start.toISOString()}&to=${end.toISOString()}`;
}

export default function DashboardPage() {
  const { toast } = useToast();
  // Cada bloco só existe para quem pode usá-lo e trata o próprio erro (#199):
  // Atendente e Profissional não têm resumo financeiro nem estoque, e um bloco
  // negado não derruba mais a tela inicial inteira.
  const can = useStaffAccess();
  const showFinance = can('/api/summary');
  const showStock = can('/api/supplies');
  const showTriage = can('/api/photos/triage');
  // Aviso de maioridade (#372): só quem gerencia responsáveis decide.
  const role = useStaffIdentity()?.role ?? null;
  const showMajority = role !== null && GUARDIAN_MANAGER_ROLES.includes(role);
  const summaryQuery = useApiQuery<SummaryData>(
    showFinance ? '/api/summary' : null,
  );
  const {
    data: followUps,
    error: followUpsError,
    isLoading: followUpsLoading,
    refresh: refreshFollowUps,
  } = useApiQuery<FollowUpDto[]>('/api/follow-ups?status=pending');
  const {
    data: supplies,
    error: suppliesError,
    isLoading: suppliesLoading,
    refresh: refreshSupplies,
  } = useApiQuery<SupplyDto[]>(showStock ? '/api/supplies' : null);

  const lowStock = (supplies ?? []).filter((s) => s.active && s.isLowStock);

  const resolveFollowUp = async (id: string, status: 'done' | 'cancelled') => {
    try {
      await apiFetch<FollowUpDto>(`/api/follow-ups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast({
        description:
          status === 'done' ? 'Retorno concluído' : 'Retorno cancelado',
        variant: 'success',
      });
      refreshFollowUps();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao atualizar retorno',
        variant: 'danger',
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Hoje"
        description={formatDate(new Date().toISOString())}
      />

      {showFinance && (
        <KpiGrid summary={summaryQuery.data} error={summaryQuery.error} />
      )}

      {showTriage && <TriageQueue />}

      {showMajority && <MajorityReviewCard />}

      <PendingClosureCard />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TodayAppointmentsCard
          fromSummary={showFinance ? summaryQuery : null}
        />

        <div className="flex flex-col gap-6">
          <FollowUpsCard
            followUps={followUps}
            error={followUpsError}
            isLoading={followUpsLoading}
            onRetry={refreshFollowUps}
            onResolve={resolveFollowUp}
          />
          {showStock && (
            <LowStockCard
              lowStock={lowStock}
              error={suppliesError}
              isLoading={suppliesLoading}
              onRetry={refreshSupplies}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function KpiGrid({
  summary,
  error,
}: {
  summary: SummaryData | null;
  error: string | null;
}) {
  if (error) return <ErrorAlert message={error} />;
  if (!summary) return <LoadingIndicator />;

  const cards = [
    {
      label: 'Recebido no mês',
      value: formatCurrency(summary.billing.paidCents),
      href: '/faturamento',
      tone: 'text-success',
    },
    {
      label: 'A receber',
      value: formatCurrency(summary.billing.pendingCents),
      href: '/faturamento',
      tone: 'text-warning',
    },
    {
      label: 'Consultas no mês',
      value: String(summary.appointmentsInMonth),
      href: '/agenda',
      tone: 'text-accent-ink',
    },
    {
      label: 'Faturas pendentes',
      value: String(summary.billing.pendingCount),
      href: '/faturamento',
      tone: 'text-warning',
    },
  ];

  return (
    <div
      data-kpi-grid
      className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      {cards.map((card) => (
        <Link key={card.label} href={card.href}>
          <Card className="h-full p-4 transition-colors hover:border-accent sm:p-5">
            <p className="text-ink-3 text-sm">{card.label}</p>
            <p
              className={`mt-1 font-bold text-xl tabular-nums sm:text-2xl ${card.tone}`}
            >
              {card.value}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/**
 * Consultas dos últimos 30 dias que seguem "Agendada"/"Confirmada" (#480).
 * Só aparece quando há pendência; erro ou carga não ocupam espaço na tela.
 */
function PendingClosureCard() {
  const { data } = useApiQuery<AppointmentDto[]>(
    `/api/appointments?${closurePendingRange()}`,
  );
  const pending = pendingClosure(data ?? [], new Date());
  if (pending.length === 0) return null;
  const homonyms = homonymPatientIds(pending);

  return (
    <Card data-pending-closure className="mb-6 border-warning p-5">
      <h2 className="font-semibold text-lg">
        {`Consultas sem desfecho (${pending.length})`}
      </h2>
      <p className="mb-3 text-ink-3 text-sm">
        Já passaram e seguem agendadas ou confirmadas: conclua, registre a falta
        ou cancele.
      </p>
      <ul className="divide-y divide-border">
        {pending.slice(0, PENDING_CLOSURE_CAP).map((appointment) => (
          <li key={appointment.id} className="flex items-center gap-4 py-2">
            <span className="w-32 shrink-0 font-mono text-ink-2 text-sm">
              {`${formatDate(appointment.startsAt)} ${formatTime(appointment.startsAt)}`}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {listPatientName(appointment, homonyms)}
            </span>
            <span className="hidden truncate text-ink-3 text-sm sm:block">
              {appointment.procedure}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/agenda"
        className="mt-3 inline-flex min-h-11 items-center font-medium text-accent-ink text-sm hover:underline"
      >
        Abrir a agenda para dar o desfecho
      </Link>
    </Card>
  );
}

const PENDING_CLOSURE_CAP = 8;

/** Próximo atendimento e números do dia, no topo da agenda de hoje (#428). */
function DayHighlights({ today }: { today: AppointmentDto[] }) {
  const next = nextAppointment(today, new Date());
  const counts = dayCounts(today);

  return (
    <div data-day-highlights className="mb-3 border-border border-b pb-3">
      {next && (
        <div data-next-appointment>
          <p className="text-ink-3 text-xs">Próximo atendimento</p>
          <p className="font-semibold">
            <Link
              href={`/pacientes/${next.patientId}`}
              className="hover:underline"
            >
              {`${next.patientName} · ${formatTime(next.startsAt)}`}
            </Link>
          </p>
          <p className="text-ink-2 text-sm">{`Procedimento: ${next.procedure}`}</p>
        </div>
      )}
      <p className="mt-2 text-ink-3 text-sm" data-day-counts>
        {`${counts.completed} de ${counts.total} concluídas`}
      </p>
    </div>
  );
}

/**
 * Consultas de hoje: do resumo, para quem o recebe (Admin); senão, da agenda
 * do dia — que para o Profissional já vem restrita à própria agenda (R4).
 */
function TodayAppointmentsCard({
  fromSummary,
}: {
  fromSummary: {
    data: SummaryData | null;
    error: string | null;
    isLoading: boolean;
    refresh: () => void;
  } | null;
}) {
  const own = useApiQuery<AppointmentDto[]>(
    fromSummary ? null : `/api/appointments?${todayRange()}`,
  );
  const today = fromSummary ? (fromSummary.data?.today ?? null) : own.data;
  const source = fromSummary ?? own;
  const homonyms = homonymPatientIds(today ?? []);

  return (
    <SummaryCard
      title="Consultas de hoje"
      href={{ label: 'Ver agenda completa', url: '/agenda' }}
      error={source.error}
      isLoading={source.isLoading}
      onRetry={source.refresh}
      isEmpty={!today || today.length === 0}
      emptyMessage="Nenhuma consulta agendada para hoje."
      emptyIcon="check-circle"
    >
      <DayHighlights today={today ?? []} />
      <ul className="divide-y divide-border">
        {(today ?? []).map((appointment) => (
          <li key={appointment.id} className="flex items-center gap-4 py-3">
            <span className="w-24 shrink-0 font-mono text-ink-2 text-sm">
              {formatTime(appointment.startsAt)}–
              {formatTime(appointment.endsAt)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {listPatientName(appointment, homonyms)}
              </p>
              <p className="truncate text-ink-3 text-sm">
                {appointment.procedure}
              </p>
            </div>
            <StatusBadge
              status={appointment.status}
              label={
                APPOINTMENT_STATUS_LABELS[appointment.status] ??
                appointment.status
              }
            />
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}

// Mesmo cap das demais cards do dashboard (LowStockCard, TriageQueue).
const FOLLOW_UPS_CAP = 8;

interface FollowUpsCardProps {
  followUps: FollowUpDto[] | null;
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  onResolve: (id: string, status: 'done' | 'cancelled') => Promise<void>;
}

function FollowUpsCard({
  followUps,
  error,
  isLoading,
  onRetry,
  onResolve,
}: FollowUpsCardProps) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const visible = (followUps ?? []).slice(0, FOLLOW_UPS_CAP);
  const followUpHomonyms = homonymPatientIds(visible);
  const { data: whatsappSent } = useApiQuery<Record<string, string>>(
    visible.length > 0
      ? `/api/reminders/whatsapp-link?kind=recall&referenceIds=${visible.map((f) => f.id).join(',')}`
      : null,
  );

  const resolve = async (id: string, status: 'done' | 'cancelled') => {
    setSubmittingId(id);
    try {
      await onResolve(id, status);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <SummaryCard
      title="Retornos pendentes"
      error={error}
      isLoading={isLoading}
      onRetry={onRetry}
      isEmpty={!followUps || followUps.length === 0}
      emptyMessage="Nenhum retorno pendente."
    >
      {followUps && (
        <ul className="divide-y divide-border">
          {visible.map((followUp) => (
            <li
              key={followUp.id}
              data-follow-up-row
              className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="min-w-0 flex-1" data-follow-up-text>
                <p className="break-words font-medium sm:truncate">
                  <Link
                    href={`/pacientes/${followUp.patientId}`}
                    className="hover:underline"
                  >
                    {listPatientName(followUp, followUpHomonyms)}
                  </Link>
                </p>
                <p className="break-words text-ink-3 sm:truncate">
                  {followUp.reason}
                </p>
                {followUp.recallExhausted && (
                  <Badge variant="secondary" data-recall-exhausted>
                    3 lembretes sem resposta
                  </Badge>
                )}
              </div>
              <div
                className="flex flex-wrap items-center gap-x-3"
                data-follow-up-actions
              >
                <span
                  className={`shrink-0 font-medium text-xs ${
                    followUp.isOverdue ? 'text-danger' : 'text-ink-3'
                  }`}
                >
                  {followUp.isOverdue ? (
                    <>
                      <Icon name="alert-triangle" /> Atrasado —{' '}
                    </>
                  ) : null}
                  {formatDate(followUp.dueDate)}
                </span>
                <Link
                  href={`/agenda?followUpId=${followUp.id}&patientId=${followUp.patientId}&procedure=${encodeURIComponent(followUp.reason.replace(/^Retorno: /, ''))}`}
                  className="flex min-h-11 shrink-0 items-center font-medium text-accent-ink hover:underline"
                >
                  Agendar
                </Link>
                <WhatsAppReminderButton
                  kind="recall"
                  referenceId={followUp.id}
                  sentAt={whatsappSent?.[followUp.id] ?? null}
                />
                <Button
                  type="button"
                  onClick={() => void resolve(followUp.id, 'done')}
                  variant="link"
                  disabled={submittingId === followUp.id}
                  className="h-auto min-h-11 min-w-11 shrink-0 p-0 text-success"
                >
                  {submittingId === followUp.id ? 'Enviando…' : 'Concluir'}
                </Button>
                <ConfirmAction
                  trigger={
                    <Button
                      type="button"
                      variant="link"
                      disabled={submittingId === followUp.id}
                      className="h-auto min-h-11 min-w-11 shrink-0 p-0 text-ink-3"
                    >
                      Cancelar
                    </Button>
                  }
                  title="Cancelar retorno?"
                  description="O retorno agendado será cancelado e o paciente não será mais lembrado."
                  confirmLabel="Cancelar retorno"
                  variant="danger"
                  onConfirm={() => resolve(followUp.id, 'cancelled')}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SummaryCard>
  );
}

interface LowStockCardProps {
  lowStock: SupplyDto[];
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
}

function LowStockCard({
  lowStock,
  error,
  isLoading,
  onRetry,
}: LowStockCardProps) {
  return (
    <SummaryCard
      title="Estoque baixo"
      href={{ label: 'Ver materiais', url: '/materiais' }}
      error={error}
      isLoading={isLoading}
      onRetry={onRetry}
      isEmpty={lowStock.length === 0}
      emptyMessage="Nenhum insumo abaixo do mínimo."
    >
      <ul className="divide-y divide-border text-sm">
        {lowStock.slice(0, 6).map((supply) => (
          <li key={supply.id} className="flex justify-between py-2">
            <span className="truncate">{supply.name}</span>
            <span className="shrink-0 font-medium text-warning">
              {supply.stockQty}/{supply.minQty} {supply.unit}
            </span>
          </li>
        ))}
      </ul>
    </SummaryCard>
  );
}

// Mesmo cap das outras cards do dashboard (FollowUpsCard/LowStockCard) —
// resto da fila fica em /triagem (issue #135).
const TRIAGE_QUEUE_CAP = 8;

/** Resumo da fila de triagem (O4.2) no dashboard; lista completa em `/triagem`. */
function TriageQueue() {
  const {
    queue,
    queryError,
    isLoading,
    actionError,
    submittingId,
    refresh,
    triage,
  } = useTriageQueue();

  return (
    <SummaryCard
      title={
        <>
          <Icon name="camera" /> Fotos de pacientes aguardando triagem (
          {queue?.length ?? 0})
        </>
      }
      titleClassName="font-bold text-sm text-warning"
      titleTag="h3"
      headerClassName="mb-2 flex items-center justify-between"
      href={{
        label: 'Ver todas as fotos',
        url: '/triagem',
        className:
          'inline-flex items-center gap-1 whitespace-nowrap font-medium text-sm text-warning hover:underline',
      }}
      cardClassName="mb-6 border-warning bg-warning-soft p-4"
      error={queryError}
      isLoading={isLoading}
      onRetry={refresh}
      isEmpty={!queue || queue.length === 0}
      hideWhenEmpty
    >
      <TriagePhotoList
        queue={(queue ?? []).slice(0, TRIAGE_QUEUE_CAP)}
        actionError={actionError}
        submittingId={submittingId}
        onTriage={triage}
      />
    </SummaryCard>
  );
}
