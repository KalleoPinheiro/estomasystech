'use client';

import {
  Button,
  Card,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import { useState } from 'react';
import type { MonthlyReport } from '@/application/reports/get-monthly-report';
import {
  EmptyState,
  ErrorAlert,
  LoadingIndicator,
} from '@/components/feedback';
import { MetricCard } from '@/components/metric-card';
import { PageHeader } from '@/components/page-header';
import {
  APPOINTMENT_STATUS_LABELS,
  formatCurrency,
  formatPercent,
  monthLabelPtBr,
  shiftMonth,
} from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';
import { ProductionTable } from './production-table';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

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

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const { data: report, error } = useApiQuery<MonthlyReport>(
    `/api/reports?month=${month}`,
  );
  const { data: previousReport } = useApiQuery<MonthlyReport>(
    `/api/reports?month=${shiftMonth(month, -1)}`,
  );

  return (
    <div>
      <PageHeader
        title="Relatório gerencial"
        actions={
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Mês anterior"
              variant="outline"
              className="hover:bg-surface-2"
            >
              <Icon name="chevron-left" />
            </Button>
            <span className="min-w-40 text-center font-semibold text-lg">
              {monthLabelPtBr(month)}
            </span>
            <Button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Próximo mês"
              variant="outline"
              className="hover:bg-surface-2"
            >
              <Icon name="chevron-right" />
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorAlert message={error} />
      ) : !report ? (
        <LoadingIndicator />
      ) : (
        <div className="flex flex-col gap-6">
          <ReportKpis report={report} previousReport={previousReport ?? null} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card as="section" className="p-5">
              <h2 className="mb-3 font-semibold text-lg">
                Consultas por status
              </h2>
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

            <Card as="section" className="p-5">
              <h2 className="mb-3 font-semibold text-lg">
                Receita e margem por procedimento (concluídas)
              </h2>
              {report.revenueByProcedure.length === 0 ? (
                <EmptyState message="Nenhuma consulta concluída no mês." />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table stack className="w-full text-left text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2">Procedimento</TableHead>
                          <TableHead className="py-2 text-right">
                            Qtde
                          </TableHead>
                          <TableHead className="py-2 text-right">
                            Receita
                          </TableHead>
                          <TableHead className="py-2 text-right">
                            Insumos
                          </TableHead>
                          <TableHead className="py-2 text-right">
                            Margem
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.revenueByProcedure.map((row) => (
                          <TableRow key={row.procedure}>
                            <TableCell label="Procedimento" className="py-2">
                              {row.procedure}
                            </TableCell>
                            <TableCell label="Qtde" className="py-2 text-right">
                              {row.count}
                            </TableCell>
                            <TableCell
                              label="Receita"
                              className="py-2 text-right font-medium"
                            >
                              {formatCurrency(row.totalCents)}
                            </TableCell>
                            <TableCell
                              label="Insumos"
                              className="py-2 text-right text-ink-3"
                            >
                              {formatCurrency(row.supplyCostCents)}
                            </TableCell>
                            <TableCell
                              label="Margem"
                              className={`py-2 text-right font-medium ${
                                row.marginCents >= 0
                                  ? 'text-success'
                                  : 'text-danger'
                              }`}
                            >
                              {formatCurrency(row.marginCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell className="py-2 font-semibold">
                            Total
                          </TableCell>
                          <TableCell
                            label="Qtde"
                            className="py-2 text-right font-semibold"
                          >
                            {report.revenueByProcedure.reduce(
                              (sum, row) => sum + row.count,
                              0,
                            )}
                          </TableCell>
                          <TableCell
                            label="Receita"
                            className="py-2 text-right font-semibold"
                          >
                            {formatCurrency(
                              report.revenueByProcedure.reduce(
                                (sum, row) => sum + row.totalCents,
                                0,
                              ),
                            )}
                          </TableCell>
                          <TableCell
                            label="Insumos"
                            className="py-2 text-right font-semibold"
                          >
                            {formatCurrency(
                              report.revenueByProcedure.reduce(
                                (sum, row) => sum + row.supplyCostCents,
                                0,
                              ),
                            )}
                          </TableCell>
                          <TableCell
                            label="Margem"
                            className="py-2 text-right font-semibold"
                          >
                            {formatCurrency(
                              report.revenueByProcedure.reduce(
                                (sum, row) => sum + row.marginCents,
                                0,
                              ),
                            )}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                  {report.unattributedSupplyCostCents > 0 && (
                    <p className="mt-3 text-warning text-xs">
                      Custo de insumos não vinculado a consulta no mês:{' '}
                      <strong>
                        {formatCurrency(report.unattributedSupplyCostCents)}
                      </strong>{' '}
                      — vincule as saídas de atendimento à consulta para margem
                      completa.
                    </p>
                  )}
                </>
              )}
            </Card>
          </div>

          <ProductionTable rows={report.productionByProfessional} />
        </div>
      )}
    </div>
  );
}
