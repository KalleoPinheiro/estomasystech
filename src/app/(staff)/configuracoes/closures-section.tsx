'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Input,
  NativeSelect,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import {
  formatDateKey,
  localDateKey,
} from '@/domain/scheduling/schedule-availability';
import { apiFetch } from '@/lib/client';
import type {
  AffectedAppointmentDto,
  ProfessionalDto,
  ScheduleClosureDto,
} from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

const LIST_WINDOW_DAYS = 400;

interface ClosureDraft {
  professionalId: string;
  startsOn: string;
  endsOn: string;
  reason: string;
}

const EMPTY_DRAFT: ClosureDraft = {
  professionalId: '',
  startsOn: '',
  endsOn: '',
  reason: '',
};

/**
 * Feriados e recessos da clínica e ausências (férias, congresso) de um
 * profissional: a agenda e o portal deixam de oferecer esses dias.
 */
export function ClosuresSection() {
  // Janela fixada na montagem (o relógio não pode ser lido em render).
  const [range] = useState(() => ({
    from: localDateKey(new Date()),
    to: localDateKey(new Date(Date.now() + LIST_WINDOW_DAYS * 86_400_000)),
  }));
  const { data, error, refresh } = useApiQuery<ScheduleClosureDto[]>(
    `/api/settings/schedule/closures?from=${range.from}&to=${range.to}`,
  );
  // Atendente não lê o cadastro de profissionais: sem a lista, só dá para
  // bloquear a clínica toda.
  const { data: professionals } =
    useApiQuery<ProfessionalDto[]>('/api/professionals');
  const [affected, setAffected] = useState<AffectedAppointmentDto[]>([]);

  const professionalName = (id: string | null) =>
    id === null
      ? 'Clínica toda'
      : (professionals?.find((p) => p.id === id)?.fullName ?? 'Profissional');

  return (
    <Card as="section" className="p-5">
      <h2 className="mb-1 font-semibold text-lg">Feriados e ausências</h2>
      <p className="mb-4 text-ink-3 text-sm">
        Dias sem atendimento da clínica toda (feriados, recesso) ou de um
        profissional (férias, congresso). Nenhum agendamento cai nesses dias.
      </p>

      <ClosureForm
        professionals={professionals ?? []}
        onCreated={(created) => {
          setAffected(created);
          refresh();
        }}
      />

      {affected.length > 0 && (
        <Alert variant="warning" className="mt-4">
          <AlertDescription>
            <strong>
              Já havia {affected.length}{' '}
              {affected.length === 1
                ? 'consulta marcada'
                : 'consultas marcadas'}{' '}
              nesse período — remarque ou cancele pela agenda:
            </strong>
            <ul className="mt-1 list-inside list-disc">
              {affected.map((appointment) => (
                <li key={appointment.id}>
                  {formatDateTime(appointment.startsAt)} —{' '}
                  {appointment.procedure}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-4">
        {error && <ErrorAlert message={error} />}
        {!error && !data && <LoadingIndicator />}
        {data && data.length === 0 && (
          <EmptyState message="Nenhum feriado ou ausência cadastrado." />
        )}
        {data && data.length > 0 && (
          <ClosuresTable
            closures={data}
            professionalName={professionalName}
            onDeleted={refresh}
          />
        )}
      </div>
    </Card>
  );
}

function ClosureForm({
  professionals,
  onCreated,
}: {
  professionals: ProfessionalDto[];
  onCreated: (affected: AffectedAppointmentDto[]) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ClosureDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{
        affectedAppointments: AffectedAppointmentDto[];
      }>('/api/settings/schedule/closures', {
        method: 'POST',
        body: JSON.stringify({
          professionalId: draft.professionalId || null,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn || null,
          reason: draft.reason,
        }),
      });
      toast({ description: 'Bloqueio cadastrado', variant: 'success' });
      setDraft(EMPTY_DRAFT);
      onCreated(result.affectedAppointments);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao cadastrar bloqueio',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="font-medium text-sm">
          Quem
          <NativeSelect
            value={draft.professionalId}
            onChange={(e) =>
              setDraft({ ...draft, professionalId: e.target.value })
            }
            className="mt-1"
          >
            <option value="">Clínica toda</option>
            {professionals
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
          </NativeSelect>
        </label>
        <label className="font-medium text-sm">
          De *
          <Input
            type="date"
            required
            value={draft.startsOn}
            onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Até
          <Input
            type="date"
            min={draft.startsOn || undefined}
            value={draft.endsOn}
            onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Motivo *
          <Input
            required
            maxLength={200}
            placeholder="Ex.: Natal, férias"
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
            className="mt-1"
          />
        </label>
      </div>
      <Button
        type="submit"
        variant="accent"
        disabled={saving}
        className="self-start"
      >
        {saving ? 'Salvando…' : 'Adicionar bloqueio'}
      </Button>
    </form>
  );
}

function ClosuresTable({
  closures,
  professionalName,
  onDeleted,
}: {
  closures: ScheduleClosureDto[];
  professionalName: (id: string | null) => string;
  onDeleted: () => void;
}) {
  const { toast } = useToast();

  const remove = async (closure: ScheduleClosureDto) => {
    try {
      await apiFetch(`/api/settings/schedule/closures/${closure.id}`, {
        method: 'DELETE',
      });
      toast({ description: 'Bloqueio removido', variant: 'success' });
      onDeleted();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao remover bloqueio',
        variant: 'danger',
      });
    }
  };

  return (
    <div className="overflow-x-auto">
      <Table className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2 pr-3">Período</TableHead>
            <TableHead className="py-2 pr-3">Quem</TableHead>
            <TableHead className="py-2 pr-3">Motivo</TableHead>
            <TableHead className="py-2 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {closures.map((closure) => (
            <TableRow key={closure.id}>
              <TableCell className="py-2 pr-3">
                {closure.startsOn === closure.endsOn
                  ? formatDateKey(closure.startsOn)
                  : `${formatDateKey(closure.startsOn)} a ${formatDateKey(closure.endsOn)}`}
              </TableCell>
              <TableCell className="py-2 pr-3">
                {professionalName(closure.professionalId)}
              </TableCell>
              <TableCell className="py-2 pr-3">{closure.reason}</TableCell>
              <TableCell className="py-2 text-right">
                <ConfirmAction
                  trigger={
                    <Button type="button" size="sm" variant="ghost">
                      Remover
                    </Button>
                  }
                  title="Remover bloqueio"
                  description={`Remover "${closure.reason}"? Os dias voltam a aceitar agendamentos.`}
                  confirmLabel="Remover"
                  variant="danger"
                  onConfirm={() => remove(closure)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
