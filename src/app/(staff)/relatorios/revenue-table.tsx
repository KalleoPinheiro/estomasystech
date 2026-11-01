import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@still-void/ui/react';
import type { MonthlyReport } from '@/application/reports/get-monthly-report';
import { EmptyState } from '@/components/feedback';
import { formatCurrency } from '@/lib/format';

/** Receita e margem por procedimento do mês, com o total e os avisos de custo não apurado. */
export function RevenueTable({ report }: { report: MonthlyReport }) {
  const knownRows = report.revenueByProcedure.filter(
    (row) => row.supplyCostKnown,
  );
  return (
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
                  <TableHead className="py-2 text-right">Qtde</TableHead>
                  <TableHead className="py-2 text-right">Receita</TableHead>
                  <TableHead className="py-2 text-right">Insumos</TableHead>
                  <TableHead className="py-2 text-right">Margem</TableHead>
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
                      {row.supplyCostKnown
                        ? formatCurrency(row.supplyCostCents)
                        : 'Não apurado'}
                    </TableCell>
                    <TableCell
                      label="Margem"
                      className={`py-2 text-right font-medium ${
                        row.supplyCostKnown
                          ? row.marginCents >= 0
                            ? 'text-success'
                            : 'text-danger'
                          : 'text-ink-3'
                      }`}
                    >
                      {row.supplyCostKnown
                        ? formatCurrency(row.marginCents)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="py-2 font-semibold">Total</TableCell>
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
                    {knownRows.length > 0
                      ? formatCurrency(
                          knownRows.reduce(
                            (sum, row) => sum + row.supplyCostCents,
                            0,
                          ),
                        )
                      : 'Não apurado'}
                  </TableCell>
                  <TableCell
                    label="Margem"
                    className="py-2 text-right font-semibold"
                  >
                    {knownRows.length > 0
                      ? formatCurrency(
                          knownRows.reduce(
                            (sum, row) => sum + row.marginCents,
                            0,
                          ),
                        )
                      : '—'}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {knownRows.length < report.revenueByProcedure.length && (
            <p className="mt-3 text-ink-3 text-xs">
              Procedimento sem saída de insumo vinculada às consultas: custo e
              margem não apurados (a margem não é igual à receita). Vincule o
              kit ou as saídas para apurar.
            </p>
          )}
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
  );
}
