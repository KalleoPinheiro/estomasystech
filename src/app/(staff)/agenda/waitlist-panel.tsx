'use client';

import {
  Button,
  Card,
  Input,
  NativeSelect,
  Textarea,
} from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { EmptyState, ErrorAlert } from '@/components/feedback';
import { Modal } from '@/components/modal';
import { PatientPicker } from '@/components/patient-picker';
import { formatDateKey } from '@/domain/scheduling/schedule-availability';
import { apiFetch } from '@/lib/client';
import type {
  ProcedureOptionDto,
  ProfessionalOptionDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';

interface WaitlistPanelProps {
  professionals: ProfessionalOptionDto[];
  /** Muda quando a agenda muda (ex.: entrada marcada pelo formulário). */
  version: number;
  onSchedule: (entry: WaitlistEntryDto) => void;
}

/**
 * Lista de espera por ordem de chegada. Quando um horário vaga, a recepção
 * oferece a vaga a quem aceita aquele dia e marca pela agenda ("Agendar").
 */
export function WaitlistPanel({
  professionals,
  version,
  onSchedule,
}: WaitlistPanelProps) {
  const { toast } = useToast();
  const { data, error, refresh } = useApiQuery<WaitlistEntryDto[]>(
    `/api/waitlist?v=${version}`,
  );
  const [adding, setAdding] = useState(false);

  const professionalName = (id: string | null) =>
    id === null
      ? 'Qualquer profissional'
      : (professionals.find((p) => p.id === id)?.fullName ?? 'Profissional');

  const remove = async (entry: WaitlistEntryDto) => {
    try {
      await apiFetch(`/api/waitlist/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ resolution: 'removed' }),
      });
      toast({ description: 'Removido da lista de espera', variant: 'success' });
      refresh();
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao remover da lista',
        variant: 'danger',
      });
    }
  };

  return (
    <Card as="section" className="mt-6 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">
          Lista de espera{data && data.length > 0 ? ` (${data.length})` : ''}
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
        >
          + Adicionar
        </Button>
      </div>
      {error && <ErrorAlert message={error} />}
      {data && data.length === 0 && (
        <EmptyState message="Ninguém aguardando vaga." />
      )}
      {data && data.length > 0 && (
        <ol className="flex flex-col divide-y divide-border text-sm">
          {data.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {entry.patientName ?? 'Paciente'}
                  {entry.source === 'patient' && (
                    <span className="ml-2 text-ink-3 text-xs">
                      (pelo portal)
                    </span>
                  )}
                </p>
                <p className="text-ink-3 text-xs">
                  {entry.procedureName ?? 'Qualquer procedimento'} ·{' '}
                  {professionalName(entry.professionalId)} ·{' '}
                  {formatDateKey(entry.fromDate)} a{' '}
                  {formatDateKey(entry.toDate)}
                </p>
                {entry.notes && (
                  <p className="text-ink-2 text-xs">{entry.notes}</p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="accent"
                onClick={() => onSchedule(entry)}
              >
                Agendar
              </Button>
              <ConfirmAction
                trigger={
                  <Button type="button" size="sm" variant="ghost">
                    Remover
                  </Button>
                }
                title="Remover da lista de espera"
                description={`Tirar ${entry.patientName ?? 'o paciente'} da lista de espera?`}
                confirmLabel="Remover"
                variant="danger"
                onConfirm={() => remove(entry)}
              />
            </li>
          ))}
        </ol>
      )}

      {adding && (
        <Modal
          title="Adicionar à lista de espera"
          onClose={() => setAdding(false)}
        >
          <WaitlistForm
            professionals={professionals}
            onSaved={() => {
              setAdding(false);
              refresh();
            }}
          />
        </Modal>
      )}
    </Card>
  );
}

interface WaitlistDraft {
  patientId: string;
  procedureId: string;
  professionalId: string;
  fromDate: string;
  toDate: string;
  notes: string;
}

function WaitlistForm({
  professionals,
  onSaved,
}: {
  professionals: ProfessionalOptionDto[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: catalog, error: catalogError } = useApiQuery<
    ProcedureOptionDto[]
  >('/api/options/procedures');
  const [draft, setDraft] = useState<WaitlistDraft>({
    patientId: '',
    procedureId: '',
    professionalId: '',
    fromDate: '',
    toDate: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (change: Partial<WaitlistDraft>) =>
    setDraft((prev) => ({ ...prev, ...change }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!draft.patientId) {
      setError('Selecione o paciente');
      return;
    }
    setSaving(true);
    try {
      await apiFetch('/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          patientId: draft.patientId,
          procedureId: draft.procedureId || null,
          professionalId: draft.professionalId || null,
          fromDate: draft.fromDate,
          toDate: draft.toDate,
          notes: draft.notes.trim() || null,
        }),
      });
      toast({
        description: 'Adicionado à lista de espera',
        variant: 'success',
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && <ErrorAlert message={error} />}
      {catalogError && (
        <ErrorAlert
          message={`Não foi possível carregar o catálogo de procedimentos: ${catalogError}`}
        />
      )}
      <PatientPicker
        label="Paciente *"
        value={draft.patientId}
        onChange={(patientId) => set({ patientId })}
      />
      <label className="font-medium text-sm">
        Procedimento
        <NativeSelect
          value={draft.procedureId}
          onChange={(e) => set({ procedureId: e.target.value })}
          className="mt-1"
        >
          <option value="">Qualquer</option>
          {(catalog ?? [])
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </NativeSelect>
      </label>
      <label className="font-medium text-sm">
        Profissional
        <NativeSelect
          value={draft.professionalId}
          onChange={(e) => set({ professionalId: e.target.value })}
          className="mt-1"
        >
          <option value="">Qualquer</option>
          {professionals
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
        </NativeSelect>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-medium text-sm">
          Aceita a partir de *
          <Input
            type="date"
            required
            value={draft.fromDate}
            onChange={(e) => set({ fromDate: e.target.value })}
            className="mt-1"
          />
        </label>
        <label className="font-medium text-sm">
          Até *
          <Input
            type="date"
            required
            min={draft.fromDate || undefined}
            value={draft.toDate}
            onChange={(e) => set({ toDate: e.target.value })}
            className="mt-1"
          />
        </label>
      </div>
      <label className="font-medium text-sm">
        Observação
        <Textarea
          maxLength={500}
          placeholder="Ex.: só de manhã"
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className="mt-1"
        />
      </label>
      <Button type="submit" variant="accent" disabled={saving}>
        {saving ? 'Salvando…' : 'Adicionar à lista'}
      </Button>
    </form>
  );
}
