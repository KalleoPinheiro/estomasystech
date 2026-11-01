import 'server-only';
import {
  GetMonthlyReport,
  isReportSettled,
  type MonthlyReport,
} from '@/application/reports/get-monthly-report';
import {
  startOfZonedMonth,
  startOfZonedMonthOf,
  zonedParts,
} from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { cacheReport, getCachedReport } from '@/lib/report-cache';

/** Formato do mês pedido: `YYYY-MM`. */
export const REPORT_MONTH_REGEX = /^\d{4}-\d{2}$/;

/**
 * Relatório gerencial do mês da empresa da sessão (`month` = `YYYY-MM`; sem ele,
 * o mês corrente no fuso da clínica). Mesma resposta de `GET /api/reports`, que
 * reaproveita esta função, e fonte da tela de Relatórios: um só lugar monta o
 * relatório (ADR-074 § 3).
 *
 * O cache de mês encerrado em memória, chaveado por empresa, fica como está
 * (ADR-069 § 3): só o relatório assentado entra, e nunca atravessa empresas.
 */
export async function getMonthlyReportFor(
  session: Session,
  month?: string,
): Promise<MonthlyReport> {
  const now = new Date();
  const current = zonedParts(now);
  const [year, monthNumber] = month
    ? [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
    : [current.year, current.month];
  const from = startOfZonedMonth(year, monthNumber);
  const to = startOfZonedMonth(year, monthNumber + 1);

  const isClosedMonth = to.getTime() <= startOfZonedMonthOf(now).getTime();
  const cacheKey = `${year}-${String(monthNumber).padStart(2, '0')}`;
  // Escopo da sessão: empresa vê só os próprios números; papel de sistema
  // (sem clínica) mantém a visão cross-empresa.
  const tenant = sessionScope(session);
  const { clinicId } = tenant;
  const cached = isClosedMonth
    ? getCachedReport(clinicId, cacheKey)
    : undefined;
  if (cached) return cached;

  const {
    appointments,
    invoices,
    producedSessions,
    stockMovements,
    professionals,
  } = await getRepositories(tenant);
  const report = await new GetMonthlyReport(
    appointments,
    invoices,
    producedSessions,
    stockMovements,
    professionals,
  ).execute({ from, to });
  // Mês encerrado ainda muda enquanto houver fatura pendente ou comissão a
  // liberar — só o relatório assentado vai para o cache.
  if (isClosedMonth && isReportSettled(report)) {
    cacheReport(clinicId, cacheKey, report);
  }
  return report;
}
