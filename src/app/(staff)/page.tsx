'use client';

import { Button, Card, Icon } from '@still-void/ui/react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useToast,
} from '@still-void/ui/react/client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { BillingSummary } from '@/application/billing/get-billing-summary';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { AppointmentDto, FollowUpDto, SupplyDto } from '@/lib/dto';
import {
  APPOINTMENT_STATUS_LABELS,
  formatCurrency,
  formatDate,
  formatTime,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

interface SummaryData {
  billing: BillingSummary;
  appointmentsInMonth: number;
  today: AppointmentDto[];
}

export default function DashboardPage() {
  const { toast } = useToast();
  const { data: summary, error } = useApiQuery<SummaryData>('/api/summary');
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
  } = useApiQuery<SupplyDto[]>('/api/supplies');

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
    <div>
      <h1 className="sv-display pt-0 pb-6 font-bold text-2xl">Dashboard</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            aria-label={`Ver ${card.label.toLowerCase()}`}
          >
            <Card className="p-5 transition-colors hover:border-accent">
              <p className="text-ink-3 text-sm">{card.label}</p>
              <p className={`mt-1 font-bold text-2xl ${card.tone}`}>
                {card.value}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <TriageQueue />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-lg">Consultas de hoje</h2>
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent-ink text-sm hover:underline"
            >
              Ver agenda completa <Icon name="chevron-right" />
            </Link>
          </div>
          {summary.today.length === 0 ? (
            <EmptyState
              message="Nenhuma consulta agendada para hoje."
              icon="check-circle"
              action={{ label: 'Ver agenda', href: '/agenda' }}
            />
          ) : (
            <ul className="divide-y divide-border">
              {summary.today.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex items-center gap-4 py-3"
                >
                  <span className="w-24 shrink-0 font-mono text-ink-2 text-sm">
                    {formatTime(appointment.startsAt)}–
                    {formatTime(appointment.endsAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {appointment.patientName}
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
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <FollowUpsCard
            followUps={followUps}
            error={followUpsError}
            isLoading={followUpsLoading}
            onRetry={refreshFollowUps}
            onResolve={resolveFollowUp}
          />
          <LowStockCard
            lowStock={lowStock}
            error={suppliesError}
            isLoading={suppliesLoading}
            onRetry={refreshSupplies}
          />
        </div>
      </div>
    </div>
  );
}

interface FollowUpsCardProps {
  followUps: FollowUpDto[] | null;
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
  onResolve: (id: string, status: 'done' | 'cancelled') => void;
}

function FollowUpsCard({
  followUps,
  error,
  isLoading,
  onRetry,
  onResolve,
}: FollowUpsCardProps) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-semibold text-lg">Retornos pendentes</h2>
      {error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : isLoading ? (
        <LoadingIndicator />
      ) : !followUps || followUps.length === 0 ? (
        <EmptyState message="Nenhum retorno pendente." icon="check-circle" />
      ) : (
        <ul className="divide-y divide-border">
          {followUps.slice(0, 8).map((followUp) => (
            <li
              key={followUp.id}
              className="flex items-center gap-3 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <Link
                    href={`/pacientes/${followUp.patientId}`}
                    className="hover:underline"
                  >
                    {followUp.patientName}
                  </Link>
                </p>
                <p className="truncate text-ink-3">{followUp.reason}</p>
              </div>
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
              <Button
                type="button"
                onClick={() => void onResolve(followUp.id, 'done')}
                variant="link"
                className="h-auto min-h-11 min-w-11 shrink-0 p-0 text-success"
              >
                Concluir
              </Button>
              <ConfirmAction
                trigger={
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto min-h-11 min-w-11 shrink-0 p-0 text-ink-3"
                  >
                    Cancelar
                  </Button>
                }
                title="Cancelar retorno?"
                description="O retorno agendado será cancelado e o paciente não será mais lembrado."
                confirmLabel="Cancelar retorno"
                variant="danger"
                onConfirm={() => onResolve(followUp.id, 'cancelled')}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
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
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Estoque baixo</h2>
        <Link
          href="/materiais"
          className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-accent-ink text-sm hover:underline"
        >
          Ver materiais <Icon name="chevron-right" />
        </Link>
      </div>
      {error ? (
        <ErrorAlert message={error} onRetry={onRetry} />
      ) : isLoading ? (
        <LoadingIndicator />
      ) : lowStock.length === 0 ? (
        <EmptyState
          message="Nenhum insumo abaixo do mínimo."
          icon="check-circle"
        />
      ) : (
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
      )}
    </Card>
  );
}

interface TriagePhotoDto {
  id: string;
  conditionTitle: string;
  patientId: string | null;
  patientName: string;
  patientNote: string | null;
  createdAt: string;
  waitingHours: number;
  latestScore: { kind: 'push' | 'det'; value: number } | null;
}

const TRIAGE_ATTENTION_HOURS = 24;

/** Fila de triagem (O4.2): fotos enviadas por pacientes entre consultas. */
function TriageQueue() {
  const {
    data: queue,
    error: queryError,
    isLoading,
    refresh,
  } = useApiQuery<TriagePhotoDto[]>('/api/photos/triage');
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<TriagePhotoDto | null>(null);
  const { toast } = useToast();

  const triage = async (
    photo: TriagePhotoDto,
    decision: 'reviewed' | 'escalated',
  ) => {
    try {
      await apiFetch(`/api/photos/${photo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ triage: decision }),
      });
      toast({
        description:
          decision === 'reviewed' ? 'Foto revisada' : 'Foto escalada',
        variant: 'success',
      });
      setActionError(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro na triagem');
    }
  };

  if (isLoading) {
    return <LoadingIndicator />;
  }
  if (queryError) {
    return <ErrorAlert message={queryError} onRetry={refresh} />;
  }
  if (!queue || queue.length === 0) {
    return null;
  }
  return (
    <Card className="mb-6 border-accent bg-accent-soft p-4">
      <h3 className="mb-2 font-bold text-accent-ink text-sm">
        <Icon name="camera" /> Fotos de pacientes aguardando triagem (
        {queue.length})
      </h3>
      {actionError && <ErrorAlert message={actionError} />}
      <ul className="flex flex-col gap-2">
        {queue.map((photo) => (
          <li
            key={photo.id}
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <Button
              type="button"
              variant="link"
              onClick={() => setPreviewPhoto(photo)}
              aria-label={`Ampliar foto de ${photo.patientName}`}
              className="relative h-12 w-12 shrink-0 overflow-hidden rounded border border-border p-0"
            >
              <Image
                src={`/api/photos/${photo.id}`}
                alt={`Foto de ${photo.patientName}`}
                fill
                className="object-cover"
              />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {photo.patientName} — {photo.conditionTitle}
                {photo.latestScore && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="link"
                        className="ml-2 h-auto rounded bg-sv-surface px-1.5 py-0.5 font-semibold text-accent-ink text-xs no-underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-ink focus-visible:outline-offset-2"
                      >
                        {photo.latestScore.kind === 'push' ? 'PUSH' : 'DET'}{' '}
                        {photo.latestScore.value}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {photo.latestScore.kind === 'push'
                        ? 'PUSH — Pressure Ulcer Scale for Healing: escala de cicatrização de lesão por pressão'
                        : 'DET — índice Débito/Exsudato/Tecido da avaliação de estomia'}
                    </TooltipContent>
                  </Tooltip>
                )}
              </p>
              <p className="truncate text-ink-3 text-xs">
                {photo.patientNote ?? 'sem observação'} ·{' '}
                {formatDate(photo.createdAt)} ·{' '}
                <span
                  className={
                    photo.waitingHours >= TRIAGE_ATTENTION_HOURS
                      ? 'font-semibold text-danger'
                      : undefined
                  }
                >
                  aguardando há {photo.waitingHours}h
                </span>
              </p>
            </div>
            <ConfirmAction
              trigger={
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-h-11 min-w-11 p-0 text-danger"
                >
                  Ok, manter plano
                </Button>
              }
              title="Manter o plano de cuidados?"
              description="A foto é marcada como revisada sem intervenção. Não há ação de reabrir depois."
              confirmLabel="Confirmar"
              variant="danger"
              onConfirm={() => triage(photo, 'reviewed')}
            />
            <ConfirmAction
              trigger={
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-h-11 min-w-11 p-0 text-success"
                >
                  Antecipar retorno
                </Button>
              }
              title="Antecipar o retorno do paciente?"
              description="O retorno do paciente é antecipado com base nesta foto."
              confirmLabel="Confirmar antecipação"
              onConfirm={() => triage(photo, 'escalated')}
            />
          </li>
        ))}
      </ul>
      {previewPhoto && (
        <Modal
          title={`Foto de ${previewPhoto.patientName}`}
          onClose={() => setPreviewPhoto(null)}
        >
          <div className="relative mt-4 aspect-square w-full">
            <Image
              src={`/api/photos/${previewPhoto.id}`}
              alt={`Foto de ${previewPhoto.patientName}`}
              fill
              className="rounded object-contain"
            />
          </div>
        </Modal>
      )}
    </Card>
  );
}
