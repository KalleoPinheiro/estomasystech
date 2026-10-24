'use client';

import {
  Button,
  Card,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';

import { useToast } from '@still-void/ui/react/client';
import { useEffect, useState } from 'react';
import { ConfirmAction } from '@/components/confirm-action';
import { ErrorAlert } from '@/components/feedback';
import { LoadMoreButton } from '@/components/load-more-button';
import { Modal } from '@/components/modal';
import { PageHeader } from '@/components/page-header';
import { PagedList } from '@/components/paged-list';
import { PatientPhone } from '@/components/patient-phone';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch } from '@/lib/client';
import type { PartnerDto, PatientDto } from '@/lib/dto';
import { formatCivilDate } from '@/lib/format';
import { abbreviatePatientName } from '@/lib/patient-name';
import { useApiQuery } from '@/lib/use-api-query';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';
import { PatientForm, type PatientFormValues } from './patient-form';

const PAGE_SIZE = 100;

const SEARCH_DEBOUNCE_MS = 300;

interface PatientsTableProps {
  patients: PatientDto[];
  isStale: boolean;
  onEdit: (patient: PatientDto) => void;
  onToggleActive: (patient: PatientDto) => void;
}

function PatientsTable({
  patients,
  isStale,
  onEdit,
  onToggleActive,
}: PatientsTableProps) {
  return (
    <div
      className={`overflow-x-auto ${isStale ? 'pointer-events-none opacity-60' : ''}`}
      aria-busy={isStale || undefined}
    >
      <Table stack className="w-full text-left text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">Nome</TableHead>
            <TableHead className="px-4 py-3">Contato</TableHead>
            <TableHead className="px-4 py-3">Nascimento</TableHead>
            <TableHead className="px-4 py-3">Situação</TableHead>
            <TableHead className="px-4 py-3 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {patients.map((patient) => (
            <TableRow
              key={patient.id}
              className={patient.active ? '' : 'bg-surface-2/60'}
            >
              <TableCell label="Nome" className="px-4 py-3 font-medium">
                {abbreviatePatientName(patient.fullName)}
              </TableCell>
              <TableCell label="Contato" className="px-4 py-3 text-ink-2">
                {patient.email && <div>{patient.email}</div>}
                <div className="text-ink-3 text-xs">
                  <PatientPhone
                    phone={patient.phone}
                    needsCorrection={patient.phoneNeedsCorrection}
                  />
                </div>
              </TableCell>
              <TableCell label="Nascimento" className="px-4 py-3 text-ink-2">
                {patient.birthDate ? formatCivilDate(patient.birthDate) : '—'}
              </TableCell>
              <TableCell label="Situação" className="px-4 py-3">
                <StatusBadge
                  status={patient.active ? 'confirmed' : 'cancelled'}
                  label={patient.active ? 'Ativo' : 'Inativo'}
                />
              </TableCell>
              <TableCell label="Ações" className="px-4 py-3 text-right">
                <a
                  href={`/pacientes/${patient.id}`}
                  className="mr-2 font-semibold text-accent-ink hover:underline"
                >
                  Prontuário
                </a>
                <Button
                  type="button"
                  onClick={() => onEdit(patient)}
                  variant="ghost"
                  size="sm"
                >
                  Editar
                </Button>
                {patient.active ? (
                  <ConfirmAction
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        Desativar
                      </Button>
                    }
                    title="Desativar paciente?"
                    description="O paciente para de aparecer nos fluxos ativos."
                    confirmLabel="Confirmar"
                    variant="danger"
                    onConfirm={() => onToggleActive(patient)}
                  />
                ) : patient.anonymized ? (
                  <span className="text-ink-3 text-xs">
                    Anonimizado: para voltar, cadastre a pessoa novamente.
                  </span>
                ) : (
                  <Button
                    type="button"
                    onClick={() => onToggleActive(patient)}
                    variant="ghost"
                    size="sm"
                  >
                    Reativar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PatientsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PatientDto | 'new' | null>(null);
  const { data: partners } = useApiQuery<PartnerDto[]>('/api/partners');

  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [search]);

  const {
    items: patients,
    hasMore,
    error: loadError,
    isLoading,
    refresh,
    loadMore,
  } = useCursorPagedQuery<PatientDto>(
    `/api/patients${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`,
    PAGE_SIZE,
  );
  const error = actionError ?? loadError;
  const emptyMessage = debouncedSearch
    ? `Nenhum paciente encontrado para "${debouncedSearch}".`
    : 'Nenhum paciente cadastrado.';

  const handleSubmit = async (values: PatientFormValues) => {
    const payload = {
      fullName: values.fullName,
      email: values.email.trim() || null,
      phone: values.phone,
      // Em branco: novo cadastro sem CPF; edição mantém o que está guardado.
      cpf: values.cpf.trim() || undefined,
      // Data civil: AAAA-MM-DD, sem hora nem fuso (ADR-073).
      birthDate: values.birthDate || null,
      notes: values.notes || null,
      referredByPartnerId: values.referredByPartnerId || null,
    };
    try {
      if (editing === 'new') {
        await apiFetch<PatientDto>('/api/patients', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } else if (editing) {
        await apiFetch<PatientDto>(`/api/patients/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      toast({
        description:
          editing === 'new' ? 'Paciente criado' : 'Paciente atualizado',
        variant: 'success',
      });
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : 'Erro ao salvar paciente',
        variant: 'danger',
      });
      throw err;
    }
    setEditing(null);
    refresh();
  };

  const toggleActive = async (patient: PatientDto) => {
    try {
      await apiFetch<PatientDto>(`/api/patients/${patient.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !patient.active }),
      });
      setActionError(null);
      toast({
        description: patient.active
          ? 'Paciente desativado'
          : 'Paciente reativado',
        variant: 'success',
      });
      refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao atualizar paciente';
      setActionError(message);
      toast({ description: message, variant: 'danger' });
    }
  };

  return (
    <div>
      <PageHeader
        title="Pacientes"
        actions={
          <Button
            type="button"
            onClick={() => setEditing('new')}
            variant="accent"
          >
            + Novo paciente
          </Button>
        }
      />

      {error && <ErrorAlert message={error} />}

      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por nome, email ou telefone…"
        className="mb-4 w-full"
      />

      <Card>
        <PagedList
          items={patients}
          emptyMessage={emptyMessage}
          render={(list) => (
            <PatientsTable
              patients={list}
              isStale={isLoading}
              onEdit={setEditing}
              onToggleActive={(patient) => void toggleActive(patient)}
            />
          )}
        />
      </Card>

      <LoadMoreButton
        visible={Boolean(patients) && hasMore}
        onClick={loadMore}
      />

      {editing && (
        <Modal
          title={editing === 'new' ? 'Novo paciente' : 'Editar paciente'}
          onClose={() => setEditing(null)}
        >
          <PatientForm
            initial={editing === 'new' ? undefined : editing}
            partners={partners ?? []}
            onSubmit={handleSubmit}
          />
        </Modal>
      )}
    </div>
  );
}
