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
import { useMediaQuery } from '@still-void/ui/react/client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { LoadMoreButton } from '@/components/load-more-button';
import { PageHeader } from '@/components/page-header';
import { PagedList } from '@/components/paged-list';
import { PatientPicker } from '@/components/patient-picker';
import {
  ACTION_LABELS,
  ACTOR_ROLE_LABELS,
  formatAuditDetail,
  formatDateTimeWithSeconds,
  RESOURCE_LABELS,
} from '@/lib/audit-labels';
import {
  clinicDayEnd,
  clinicDayStart,
  instantDayKey,
} from '@/lib/clinic-calendar';
import type { AuditEventDto } from '@/lib/dto';
import { useCursorPagedQuery } from '@/lib/use-cursor-paged-query';

const PAGE_SIZE_MOBILE = 25;
const PAGE_SIZE_DESKTOP = 50;

type Filters = { patientId: string; from: string; to: string };

/** Data da URL só vale se existir no calendário: `?de=abc` não pode derrubar a tela. */
function validDateParam(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  // 2027-02-31 normaliza para março: só vale o dia que volta igual.
  return instantDayKey(clinicDayStart(value)) === value ? value : '';
}

/** Filtros na URL (`?paciente=&de=&ate=`): a tela compartilha e recarrega o mesmo recorte. */
function writeFiltersToUrl({ patientId, from, to }: Filters) {
  const params = new URLSearchParams();
  if (patientId) params.set('paciente', patientId);
  if (from) params.set('de', from);
  if (to) params.set('ate', to);
  const search = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}`,
  );
}

export default function AuditPage() {
  const searchParams = useSearchParams();
  const [patientId, setPatientId] = useState(
    () => searchParams?.get('paciente') ?? '',
  );
  const [from, setFrom] = useState(() =>
    validDateParam(searchParams?.get('de')),
  );
  const [to, setTo] = useState(() => validDateParam(searchParams?.get('ate')));
  const compact = useMediaQuery('(max-width: 767px)');
  const pageSize = compact ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;
  const updateFilters = (next: Partial<Filters>) => {
    const filters = { patientId, from, to, ...next };
    setPatientId(filters.patientId);
    setFrom(filters.from);
    setTo(filters.to);
    writeFiltersToUrl(filters);
  };

  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  if (from) params.set('from', clinicDayStart(from).toISOString());
  if (to) params.set('to', clinicDayEnd(to, 999).toISOString());
  const query = params.toString() ? `?${params.toString()}` : '';
  const {
    items: events,
    hasMore,
    error,
    isLoading,
    loadMore,
  } = useCursorPagedQuery<AuditEventDto>(`/api/audit${query}`, pageSize);

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
                onChange={(e) => updateFilters({ from: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-ink-2 text-sm">
              Até
              <Input
                type="date"
                value={to}
                onChange={(e) => updateFilters({ to: e.target.value })}
              />
            </label>
            <div className="min-w-64">
              <PatientPicker
                label="Filtrar por paciente"
                value={patientId}
                onChange={(id) => updateFilters({ patientId: id })}
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
                        <span className="font-medium">
                          {ACTOR_ROLE_LABELS[event.actorRole] ??
                            event.actorRole}
                        </span>
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
                        {formatAuditDetail(event.resourceType, event.detail)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        />
      </Card>

      {events && events.length > 0 && (
        <p className="mt-3 text-center text-ink-3 text-sm">
          {events.length} {events.length === 1 ? 'evento' : 'eventos'}{' '}
          {hasMore ? 'carregados' : 'no total'}
        </p>
      )}

      <LoadMoreButton visible={Boolean(events) && hasMore} onClick={loadMore} />
    </div>
  );
}
