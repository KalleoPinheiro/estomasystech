'use client';

import {
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
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { LoadMoreButton } from '@/components/load-more-button';
import { PageHeader } from '@/components/page-header';
import { PagedList } from '@/components/paged-list';
import type { AuditEventDto, PatientDto } from '@/lib/dto';
import { useApiQuery } from '@/lib/use-api-query';
import { usePagedQuery } from '@/lib/use-paged-query';

const PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, string> = {
  read: 'Leitura',
  create: 'Criação',
  update: 'Alteração',
  delete: 'Exclusão',
};

const RESOURCE_LABELS: Record<string, string> = {
  anamnesis: 'Anamnese',
  evolution: 'Evolução',
  evolutions: 'Evoluções',
  condition: 'Condição',
  conditions: 'Condições',
  assessment: 'Avaliação',
  assessments: 'Avaliações',
  'portal-patient': 'Portal do paciente',
  'portal-partner': 'Portal do parceiro',
  photo: 'Foto',
  photos: 'Fotos',
  document: 'Documento',
  'account-password': 'Senha da conta',
  appointment: 'Consulta',
  care_plan: 'Plano de cuidado',
  care_plan_diagnosis: 'Diagnóstico do plano de cuidado',
  care_plan_intervention: 'Intervenção do plano de cuidado',
  care_plan_outcome: 'Desfecho do plano de cuidado',
  care_plans: 'Planos de cuidado',
  'clinic-info': 'Dados da clínica',
  'clinic-schedule': 'Grade de horários',
  consent: 'Consentimento',
  export: 'Exportação',
  intervention_record: 'Registro de intervenção',
  outcome_evaluation: 'Avaliação de desfecho',
  patient: 'Paciente',
  session: 'Sessão',
  taxonomy_catalog: 'Catálogo de taxonomia',
  professional: 'Profissional',
  account: 'Conta de acesso',
};

function formatDateTimeWithSeconds(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditPage() {
  const [patientId, setPatientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: patients } = useApiQuery<PatientDto[]>('/api/patients');

  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
  const query = params.toString() ? `?${params.toString()}` : '';
  const {
    items: events,
    hasMore,
    error,
    isLoading,
    loadMore,
  } = usePagedQuery<AuditEventDto>(`/api/audit${query}`, PAGE_SIZE);

  const patientNames = new Map((patients ?? []).map((p) => [p.id, p.fullName]));

  return (
    <div>
      <PageHeader
        title="Auditoria de prontuário"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-ink-2 text-sm">
              De
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-ink-2 text-sm">
              Até
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <NativeSelect
              aria-label="Filtrar por paciente"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Todos os pacientes</option>
              {(patients ?? []).map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.fullName}
                </option>
              ))}
            </NativeSelect>
          </div>
        }
      />

      <p className="mb-4 text-ink-3 text-sm">
        Trilha imutável de acessos e alterações em dados clínicos (LGPD art.
        11). Somente metadados — nunca conteúdo de prontuário.
      </p>

      {error && <ErrorAlert message={error} />}

      <Card>
        <PagedList
          items={events}
          emptyMessage="Nenhum evento de auditoria registrado."
          render={(list) => (
            <div className="overflow-x-auto">
              <Table
                stack
                className={`w-full text-left text-sm ${isLoading ? 'opacity-60' : ''}`}
                aria-busy={isLoading}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4 py-3">Quando</TableHead>
                    <TableHead className="px-4 py-3">Ator</TableHead>
                    <TableHead className="px-4 py-3">Ação</TableHead>
                    <TableHead className="px-4 py-3">Recurso</TableHead>
                    <TableHead className="px-4 py-3">Paciente</TableHead>
                    <TableHead className="px-4 py-3">Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell
                        label="Quando"
                        className="whitespace-nowrap px-4 py-2 text-ink-2"
                      >
                        {formatDateTimeWithSeconds(event.occurredAt)}
                      </TableCell>
                      <TableCell label="Ator" className="px-4 py-2">
                        <span className="font-medium">{event.actorRole}</span>
                        <span className="block text-ink-3 text-xs">
                          {event.actorId}
                        </span>
                      </TableCell>
                      <TableCell label="Ação" className="px-4 py-2">
                        {ACTION_LABELS[event.action] ?? event.action}
                      </TableCell>
                      <TableCell label="Recurso" className="px-4 py-2">
                        {RESOURCE_LABELS[event.resourceType] ??
                          event.resourceType}
                      </TableCell>
                      <TableCell
                        label="Paciente"
                        className="px-4 py-2 text-ink-2"
                      >
                        {event.patientId
                          ? (patientNames.get(event.patientId) ??
                            event.patientId)
                          : '—'}
                      </TableCell>
                      <TableCell
                        label="Detalhe"
                        className="px-4 py-2 text-ink-3"
                      >
                        {event.detail ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        />
      </Card>

      <LoadMoreButton visible={Boolean(events) && hasMore} onClick={loadMore} />
    </div>
  );
}
