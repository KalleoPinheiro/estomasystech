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
import type { ProfessionalProduction } from '@/application/reports/get-monthly-report';
import { EmptyState } from '@/components/feedback';
import { formatCurrency } from '@/lib/format';

const money = (cents: number | null): string =>
  cents != null ? formatCurrency(cents) : '—';

const sum = (
  rows: ProfessionalProduction[],
  pick: (row: ProfessionalProduction) => number | null,
): number => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);

/**
 * Produção e repasse por profissional. A regra (apurada na produção, liberada
 * no recebimento, pacote rateado) vive em `domain/billing/commission.ts`.
 */
export function ProductionTable({ rows }: { rows: ProfessionalProduction[] }) {
  return (
    <Card as="section" className="p-5">
      <h2 className="mb-3 font-semibold text-lg">Produção por profissional</h2>
      {rows.length === 0 ? (
        <EmptyState message="Nenhuma produção por profissional no mês." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table stack className="w-full text-left text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">Profissional</TableHead>
                  <TableHead className="py-2 text-right">Sessões</TableHead>
                  <TableHead className="py-2 text-right">Receita</TableHead>
                  <TableHead className="py-2 text-right">
                    Repasse apurado
                  </TableHead>
                  <TableHead className="py-2 text-right">Liberado</TableHead>
                  <TableHead className="py-2 text-right">A liberar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.professionalId ?? 'none'}>
                    <TableCell label="Profissional" className="py-2">
                      {row.professionalName}
                    </TableCell>
                    <TableCell label="Sessões" className="py-2 text-right">
                      {row.count}
                    </TableCell>
                    <TableCell
                      label="Receita"
                      className="py-2 text-right font-medium"
                    >
                      {formatCurrency(row.totalCents)}
                    </TableCell>
                    <TableCell
                      label="Repasse apurado"
                      className="py-2 text-right text-ink-2"
                    >
                      {money(row.commissionCents)}
                    </TableCell>
                    <TableCell label="Liberado" className="py-2 text-right">
                      {money(row.releasedCommissionCents)}
                    </TableCell>
                    <TableCell
                      label="A liberar"
                      className="py-2 text-right text-ink-2"
                    >
                      {money(row.pendingCommissionCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="py-2 font-semibold">Total</TableCell>
                  <TableCell
                    label="Sessões"
                    className="py-2 text-right font-semibold"
                  >
                    {sum(rows, (row) => row.count)}
                  </TableCell>
                  <TableCell
                    label="Receita"
                    className="py-2 text-right font-semibold"
                  >
                    {formatCurrency(sum(rows, (row) => row.totalCents))}
                  </TableCell>
                  <TableCell
                    label="Repasse apurado"
                    className="py-2 text-right font-semibold"
                  >
                    {formatCurrency(sum(rows, (row) => row.commissionCents))}
                  </TableCell>
                  <TableCell
                    label="Liberado"
                    className="py-2 text-right font-semibold"
                  >
                    {formatCurrency(
                      sum(rows, (row) => row.releasedCommissionCents),
                    )}
                  </TableCell>
                  <TableCell
                    label="A liberar"
                    className="py-2 text-right font-semibold"
                  >
                    {formatCurrency(
                      sum(rows, (row) => row.pendingCommissionCents),
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <p className="mt-3 text-ink-2 text-xs">
            Repasse apurado sobre as sessões do mês. Liberado: fatura paga,
            cortesia ou atraso acima de 60 dias. A liberar: aguardando
            pagamento. Sessão de pacote vale o preço do pacote dividido pelas
            sessões; fatura cancelada não gera repasse.
          </p>
        </>
      )}
    </Card>
  );
}
