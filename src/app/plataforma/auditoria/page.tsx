'use client';

import {
  Card,
  Icon,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorAlert } from '@/components/feedback';
import { LoadMoreButton } from '@/components/load-more-button';
import { PageHeader } from '@/components/page-header';
import { PagedList } from '@/components/paged-list';
import {
  ACTION_LABELS,
  formatDateTimeWithSeconds,
  RESOURCE_LABELS,
} from '@/lib/audit-labels';
import type { PlatformAuditEventDto } from '@/lib/dto';
import { usePagedQuery } from '@/lib/use-paged-query';

const PAGE_SIZE = 100;

/** Coluna Clínica: evento sem empresa é da plataforma; clínica que sumiu mostra o id. */
function clinicLabel(event: PlatformAuditEventDto): string {
  if (event.clinicId === null) return 'Plataforma';
  return event.clinicName ?? event.clinicId;
}

function periodQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
  if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Trilha de plataforma (B6, #210): eventos sem empresa (login falho, segundo
 * fator, recuperação, catálogo de taxonomia) e toda ação do super_admin —
 * inclusive as feitas numa clínica, que aparecem também na trilha dela.
 */
export default function PlatformAuditPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const {
    items: events,
    hasMore,
    error,
    isLoading,
    loadMore,
  } = usePagedQuery<PlatformAuditEventDto>(
    `/api/platform/audit${periodQuery(from, to)}`,
    PAGE_SIZE,
  );

  return (
    <>
      <PageHeader
        leading={
          <Link
            href="/plataforma"
            className="inline-flex items-center gap-1 text-accent-ink text-sm hover:underline"
          >
            <Icon name="chevron-left" /> Clínicas
          </Link>
        }
        title="Trilha da plataforma"
        description="Eventos sem clínica e ações do operador da plataforma. Somente metadados."
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
          </div>
        }
      />

      {error && <ErrorAlert message={error} />}

      <Card>
        <PagedList
          items={events}
          emptyMessage="Nenhum evento de plataforma registrado."
          render={(list) => (
            <PlatformAuditTable events={list} isLoading={isLoading} />
          )}
        />
      </Card>

      <LoadMoreButton visible={Boolean(events) && hasMore} onClick={loadMore} />
    </>
  );
}

function PlatformAuditTable({
  events,
  isLoading,
}: {
  events: PlatformAuditEventDto[];
  isLoading: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table
        stack
        className={`w-full text-left text-sm ${isLoading ? 'opacity-60' : ''}`}
        aria-busy={isLoading}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="px-4 py-3">Quando</TableHead>
            <TableHead className="px-4 py-3">Clínica</TableHead>
            <TableHead className="px-4 py-3">Ator</TableHead>
            <TableHead className="px-4 py-3">Ação</TableHead>
            <TableHead className="px-4 py-3">Recurso</TableHead>
            <TableHead className="px-4 py-3">Detalhe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell
                label="Quando"
                className="whitespace-nowrap px-4 py-2 text-ink-2"
              >
                {formatDateTimeWithSeconds(event.occurredAt)}
              </TableCell>
              <TableCell label="Clínica" className="px-4 py-2">
                {clinicLabel(event)}
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
                {RESOURCE_LABELS[event.resourceType] ?? event.resourceType}
              </TableCell>
              <TableCell label="Detalhe" className="px-4 py-2 text-ink-3">
                {event.detail ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
