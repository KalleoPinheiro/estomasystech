'use client';

import {
  Card,
  Input,
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
import { PatientPicker } from '@/components/patient-picker';
import {
  ACTION_LABELS,
  formatDateTimeWithSeconds,
  RESOURCE_LABELS,
} from '@/lib/audit-labels';
import type { AuditEventDto } from '@/lib/dto';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';

const PAGE_SIZE = 100;

export default function AuditPage() {
  const [patientId, setPatientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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
  } = useCursorPagedQuery<AuditEventDto>(`/api/audit${query}`, PAGE_SIZE);

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
            <div className="min-w-64">
              <PatientPicker
                label="Filtrar por paciente"
                value={patientId}
                onChange={setPatientId}
                includeInactive
              />
            </div>
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
                          ? (event.patientName ?? event.patientId)
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
