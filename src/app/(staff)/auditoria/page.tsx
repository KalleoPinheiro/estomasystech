import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import Link from 'next/link';
import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import {
  type AuditUrlFilters,
  auditFiltersFrom,
  auditFiltersToSearch,
  auditRangeFrom,
} from '@/lib/audit-filters';
import {
  ACTION_LABELS,
  ACTOR_ROLE_LABELS,
  formatAuditDetail,
  formatDateTimeWithSeconds,
  RESOURCE_LABELS,
} from '@/lib/audit-labels';
import type { AuditEventDto } from '@/lib/dto';
import { getPatientNameFor, listAuditEventsFor } from '@/lib/server/data/audit';
import { loadBlock } from '@/lib/server/data/load-block';
import { requireStaffPageFor } from '@/lib/server/session';
import { AuditFilters } from './audit-filters';

const LINK_CLASS =
  'flex min-h-11 items-center rounded-full border border-border-strong px-4 font-medium text-sm hover:bg-surface-2';

function EventsTable({ events }: { events: AuditEventDto[] }) {
  return (
    <div className="overflow-x-auto">
      <Table stack className="w-full text-left text-sm">
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
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell
                label="Quando"
                className="whitespace-nowrap px-4 py-2 text-ink-2"
              >
                {formatDateTimeWithSeconds(event.occurredAt)}
              </TableCell>
              <TableCell label="Ator" className="px-4 py-2">
                <span className="font-medium">
                  {ACTOR_ROLE_LABELS[event.actorRole] ?? event.actorRole}
                </span>
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
              <TableCell label="Paciente" className="px-4 py-2 text-ink-2">
                {event.patientId ? (event.patientName ?? event.patientId) : '—'}
              </TableCell>
              <TableCell label="Detalhe" className="px-4 py-2 text-ink-3">
                {formatAuditDetail(event.resourceType, event.detail)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const hrefFor = (filters: Partial<AuditUrlFilters>) => {
  const search = auditFiltersToSearch(filters);
  return search ? `/auditoria?${search}` : '/auditoria';
};

/**
 * Auditoria no servidor (#555, ADR-069/074): a página do cursor e os filtros
 * vêm de `searchParams` (`?paciente=&de=&ate=&cursor=`) e chegam no HTML, sem
 * chamar `/api`. A paginação por cursor (#521) é por `Link`: «Próxima página»
 * leva o cursor da última linha. 25 eventos por página por padrão; 25 ou 50 é
 * um controle explícito (`?por=`, validado no servidor), nunca detecção de
 * largura (ADR-085).
 */
export default async function AuditPage(props?: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireStaffPageFor('/auditoria');
  const filters = auditFiltersFrom(await props?.searchParams);

  const [page, patientName] = await Promise.all([
    loadBlock(() =>
      listAuditEventsFor(session, {
        patientId: filters.patientId || undefined,
        cursor: filters.cursor || undefined,
        limit: filters.size,
        ...auditRangeFrom(filters),
      }),
    ),
    filters.patientId
      ? loadBlock(() => getPatientNameFor(session, filters.patientId))
      : null,
  ]);
  const { cursor: _cursor, ...filterOnly } = filters;
  const events = page.data?.events ?? [];
  const nextCursor = page.data?.nextCursor ?? null;

  return (
    <div>
      <PageHeader
        title="Auditoria de prontuário"
        actions={
          <AuditFilters
            filters={filterOnly}
            patientName={patientName?.data ?? null}
          />
        }
      />

      <p className="mb-4 text-ink-3 text-sm">
        Trilha imutável de acessos e alterações em dados clínicos (LGPD art.
        11). Somente metadados — nunca conteúdo de prontuário.
      </p>

      {page.error && <RefreshErrorAlert message={page.error} />}

      <Card>
        {events.length === 0 ? (
          <EmptyState message="Nenhum evento de auditoria registrado." />
        ) : (
          <EventsTable events={events} />
        )}
      </Card>

      {events.length > 0 && (
        <p className="mt-3 text-center text-ink-3 text-sm">
          {events.length} {events.length === 1 ? 'evento' : 'eventos'}{' '}
          {nextCursor ? 'nesta página' : 'no fim da trilha'}
        </p>
      )}

      <nav
        aria-label="Páginas da trilha"
        className="mt-4 flex flex-wrap justify-center gap-3"
      >
        {filters.cursor && (
          <Link href={hrefFor(filterOnly)} className={LINK_CLASS}>
            Voltar ao início
          </Link>
        )}
        {nextCursor && (
          <Link
            href={hrefFor({ ...filterOnly, cursor: nextCursor })}
            className={LINK_CLASS}
          >
            Próxima página
          </Link>
        )}
      </nav>
    </div>
  );
}
