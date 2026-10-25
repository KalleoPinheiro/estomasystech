import Link from 'next/link';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { INVOICE_STATUSES } from '@/domain/billing/invoice';
import { formatCurrency } from '@/lib/format';
import {
  getInvoiceSummaryFor,
  listInvoicesFor,
} from '@/lib/server/data/invoices';
import { loadBlock } from '@/lib/server/data/load-block';
import { listProceduresFor } from '@/lib/server/data/procedures';
import { requireStaffPageFor } from '@/lib/server/session';
import { BillingHeaderActions } from './billing-header-actions';
import { InvoicesList } from './invoices-list';

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'paid', label: 'Pagas' },
  { value: 'cancelled', label: 'Canceladas' },
];

/** Situação pedida na URL; valor desconhecido volta para «Todas». */
const statusFrom = (value: string | undefined) =>
  INVOICE_STATUSES.find((status) => status === value);

/**
 * Faturamento no servidor (#547, ADR-069): a primeira página de faturas, os
 * totais e as opções da venda de pacote chegam no HTML, em paralelo, e a carga
 * não chama `/api`. O filtro de situação é `?status=` num `Link`; recebimento,
 * desconto, cancelamento, emissão e venda de pacote são Server Actions
 * (`billing-actions.ts`) com auditoria na mesma transação.
 */
export default async function BillingPage(props?: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const session = await requireStaffPageFor('/faturamento');
  const status = statusFrom((await props?.searchParams)?.status);

  const [list, summary, procedures] = await Promise.all([
    loadBlock(() => listInvoicesFor(session, { status })),
    loadBlock(() => getInvoiceSummaryFor(session)),
    loadBlock(() => listProceduresFor(session)),
  ]);
  const error = list.error ?? summary.error ?? procedures.error;

  return (
    <div>
      <PageHeader
        title="Faturamento"
        actions={<BillingHeaderActions procedures={procedures.data ?? []} />}
      />

      {error && <RefreshErrorAlert message={error} />}

      <div
        data-kpi-grid
        className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:max-w-xl"
      >
        <MetricCard
          label="Total recebido"
          value={formatCurrency(summary.data?.paidCents ?? 0)}
          accent="text-success"
        />
        <MetricCard
          label="Total a receber"
          value={formatCurrency(summary.data?.pendingCents ?? 0)}
          accent="text-warning"
        />
      </div>

      <fieldset
        className="mb-4 flex flex-wrap gap-2 border-0 p-0"
        aria-label="Filtrar por situação"
      >
        {STATUS_FILTERS.map((filter) => {
          const active = (status ?? '') === filter.value;
          return (
            <Link
              key={filter.value}
              href={
                filter.value
                  ? `/faturamento?status=${filter.value}`
                  : '/faturamento'
              }
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-full px-3 font-medium text-sm ${
                active
                  ? 'bg-accent-ink text-bg'
                  : 'border border-border-strong text-ink-2 hover:bg-surface-2'
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </fieldset>

      {list.data && (
        <InvoicesList
          initialInvoices={list.data.invoices}
          initialCursor={list.data.nextCursor}
          status={status ?? ''}
        />
      )}
    </div>
  );
}
