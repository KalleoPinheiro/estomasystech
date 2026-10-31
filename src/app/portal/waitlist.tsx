'use client';

import { Button, Card } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { formatDateKey } from '@/domain/scheduling/schedule-availability';
import { apiFetch } from '@/lib/client';
import type { WaitlistEntryDto } from '@/lib/dto';
import { usePortalRefresh } from './use-portal-refresh';

const WAIT_WINDOW_DAYS = 30;

/** AAAA-MM-DD + n dias (calendário puro, sem fuso). */
function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Sem horário livre: o paciente entra na lista de espera a partir do dia
 * escolhido, por até 30 dias. A clínica entra em contato quando vagar.
 */
export function JoinWaitlist({
  procedureId,
  fromDate,
  onJoined,
}: {
  procedureId: string;
  fromDate: string;
  onJoined?: () => void;
}) {
  const { toast } = useToast();
  const [joined, setJoined] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (joined) {
    return (
      <p className="mt-2 text-success text-xs">
        Você está na lista de espera. A clínica avisa se vagar um horário.
      </p>
    );
  }

  const join = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/portal/patient/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          procedureId,
          fromDate,
          toDate: addDays(fromDate, WAIT_WINDOW_DAYS - 1),
        }),
      });
      setJoined(true);
      toast({
        description: 'Você entrou na lista de espera',
        variant: 'success',
      });
      onJoined?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erro ao entrar na lista de espera',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      {error && <p className="text-danger text-xs">{error}</p>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={saving}
        onClick={() => void join()}
      >
        Entrar na lista de espera ({WAIT_WINDOW_DAYS} dias)
      </Button>
    </div>
  );
}

/** Pedidos do paciente na lista de espera, com opção de sair. */
export function MyWaitlist({ entries: data }: { entries: WaitlistEntryDto[] }) {
  const { toast } = useToast();
  const refresh = usePortalRefresh();
  if (data.length === 0) return null;

  const leave = async (entry: WaitlistEntryDto) => {
    try {
      await apiFetch(`/api/portal/patient/waitlist/${entry.id}/leave`, {
        method: 'POST',
      });
      toast({
        description: 'Você saiu da lista de espera',
        variant: 'success',
      });
      refresh();
    } catch (err) {
      toast({
        description:
          err instanceof Error
            ? err.message
            : 'Erro ao sair da lista de espera',
        variant: 'danger',
      });
    }
  };

  return (
    <section>
      <h2 className="mb-3 font-semibold text-lg">Lista de espera</h2>
      <Card>
        <ul className="divide-y divide-border text-sm">
          {data.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {entry.procedureName ?? 'Consulta'}
                </p>
                <p className="text-ink-3 text-xs">
                  {formatDateKey(entry.fromDate)} a{' '}
                  {formatDateKey(entry.toDate)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void leave(entry)}
              >
                Sair da lista
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
