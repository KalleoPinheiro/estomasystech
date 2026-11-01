import { Card, Icon } from '@still-void/ui/react';
import Link from 'next/link';
import type { MonthlyReport } from '@/application/reports/get-monthly-report';
import { EmptyState } from '@/components/feedback';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import { RefreshErrorAlert } from '@/components/refresh-error-alert';
import { zonedMonthKey } from '@/domain/shared/time-zone';
import {
  APPOINTMENT_STATUS_LABELS,
  formatCurrency,
  formatPercent,
  monthLabelPtBr,
  shiftMonth,
} from '@/lib/format';
import { loadBlock } from '@/lib/server/data/load-block';
import {
  getMonthlyReportFor,
  REPORT_MONTH_REGEX,
} from '@/lib/server/data/reports';
import { requireStaffPageFor } from '@/lib/server/session';
import { ProductionTable } from './production-table';
import { RevenueTable } from './revenue-table';

/** Mês da URL só vale se for `YYYY-MM` com mês 01–12; senão volta ao corrente. */
function monthFrom(value: string | undefined): string {
  if (value && REPORT_MONTH_REGEX.test(value)) {
    const monthNumber = Number(value.slice(5, 7));
    if (monthNumber >= 1 && monthNumber <= 12) return value;
  }
  return zonedMonthKey(new Date());
}

/** Delta percentual vs. mês anterior (REL-04) — `undefined` quando não há
 * base de comparação (mês anterior não carregou ou é zero — evita divisão
 * por zero e casa direto com a prop opcional do `MetricCard`). */
function computeDelta(
  current: number,
  previous: number | undefined,
): string | undefined {
  if (!previous) return undefined;
  const change = (current - previous) / previous;
  return `${change > 0 ? '+' : ''}${formatPercent(change)} vs mês anterior`;
}

interface ReportKpisProps {
  report: MonthlyReport;
  previousReport: MonthlyReport | null;
}

function ReportKpis({ report, previousReport }: ReportKpisProps) {
  return (
    <div
      data-kpi-grid
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
    >
      <MetricCard
        label="Consultas no mês"
        value={String(report.totalAppointments)}
        delta={computeDelta(
          report.totalAppointments,
          previousReport?.totalAppointments,
        )}
      />
      <MetricCard
        label="Taxa de falta (no-show)"
        value={formatPercent(report.noShowRate)}
        accent={report.noShowRate > 0.15 ? 'text-danger' : 'text-accent-ink'}
      />
      <MetricCard
        label="Recebido"
        value={formatCurrency(report.billing.paidCents)}
        accent="text-success"
        delta={computeDelta(
          report.billing.paidCents,
          previousReport?.billing.paidCents,
        )}
      />
      <MetricCard
        label="A receber"
        value={formatCurrency(report.billing.pendingCents)}
        accent="text-warning"
        delta={computeDelta(
          report.billing.pendingCents,
          previousReport?.billing.pendingCents,
        )}
      />
    </div>
  );
}

const NAV_LINK_CLASS =
  'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-strong hover:bg-surface-2';

/** Navegação de mês por `Link` (`?month=`): a tela inteira é renderizada no servidor. */
function MonthNav({ month }: { month: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/relatorios?month=${shiftMonth(month, -1)}`}
        aria-label="Mês anterior"
        className={NAV_LINK_CLASS}
      >
        <Icon name="chevron-left" />
      </Link>
      <span className="min-w-40 text-center font-semibold text-lg">
        {monthLabelPtBr(month)}
      </span>
      <Link
        href={`/relatorios?month=${shiftMonth(month, 1)}`}
        aria-label="Próximo mês"
        className={NAV_LINK_CLASS}
      >
        <Icon name="chevron-right" />
      </Link>
    </div>
  );
}

function StatusCard({ report }: { report: MonthlyReport }) {
  return (
    <Card as="section" className="p-5">
      <h2 className="mb-3 font-semibold text-lg">Consultas por status</h2>
      {Object.keys(report.byStatus).length === 0 ? (
        <EmptyState message="Nenhuma consulta no mês." />
      ) : (
        <ul className="divide-y divide-border text-sm">
          {Object.entries(report.byStatus).map(([status, count]) => (
            <li key={status} className="flex justify-between py-2">
              <span>{APPOINTMENT_STATUS_LABELS[status] ?? status}</span>
              <span className="font-medium">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Relatório gerencial no servidor (#555, ADR-069/074): o mês pedido em
 * `?month=` e o anterior (para os deltas) chegam no HTML, em paralelo, e a
 * carga não chama `/api`. O cache de mês encerrado, em memória e chaveado por
 * empresa, fica em `getMonthlyReportFor` (ADR-069 § 3). O mês anterior que
 * falha só tira os deltas; o mês pedido que falha vira o alerta com
 * «Tentar novamente».
 */
export default async function ReportsPage(props?: {
  searchParams?: Promise<{ month?: string }>;
}) {
  const session = await requireStaffPageFor('/relatorios');
  const month = monthFrom((await props?.searchParams)?.month);

  const [current, previous] = await Promise.all([
    loadBlock(() => getMonthlyReportFor(session, month)),
    loadBlock(() => getMonthlyReportFor(session, shiftMonth(month, -1))),
  ]);

  return (
    <div>
      <PageHeader
        title="Relatório gerencial"
        actions={<MonthNav month={month} />}
      />

      {current.error || !current.data ? (
        <RefreshErrorAlert message={current.error ?? 'Erro ao carregar'} />
      ) : (
        <div className="flex flex-col gap-6">
          <ReportKpis report={current.data} previousReport={previous.data} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StatusCard report={current.data} />
            <RevenueTable report={current.data} />
          </div>
          <ProductionTable rows={current.data.productionByProfessional} />
        </div>
      )}
    </div>
  );
}
