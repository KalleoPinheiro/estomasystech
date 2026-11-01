import 'server-only';
import type { BillingSummary } from '@/application/billing/get-billing-summary';
import { GetBillingSummary } from '@/application/billing/get-billing-summary';
import { startOfZonedMonth, zonedParts } from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';

export interface MonthSummary {
  billing: BillingSummary;
  appointmentsInMonth: number;
}

/**
 * Números do mês da empresa da sessão (faturamento e consultas), no fuso da
 * clínica. `month` é `YYYY-MM`; sem ele vale o mês corrente. É a mesma resposta
 * de `GET /api/summary` (que acrescenta as consultas do dia) e alimenta os
 * cartões da tela Hoje. O painel de uma empresa nunca soma a de outra
 * (`sessionScope`, regra 1).
 */
export async function buildMonthSummary(
  session: Session,
  month?: string,
  now: Date = new Date(),
): Promise<MonthSummary> {
  const current = zonedParts(now);
  const [year, monthNumber] = month
    ? [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
    : [current.year, current.month];
  const from = startOfZonedMonth(year, monthNumber);
  const to = startOfZonedMonth(year, monthNumber + 1);

  const { appointments, invoices } = await getRepositories(
    sessionScope(session),
  );
  const [billing, monthStats] = await Promise.all([
    new GetBillingSummary(invoices).execute({ from, to }),
    appointments.getStatsInRange(from, to),
  ]);
  return {
    billing,
    appointmentsInMonth: Object.values(monthStats.byStatus).reduce(
      (sum, count) => sum + count,
      0,
    ),
  };
}
