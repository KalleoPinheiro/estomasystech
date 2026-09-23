import type { NextRequest } from 'next/server';
import {
  GetMonthlyReport,
  isReportSettled,
} from '@/application/reports/get-monthly-report';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { cacheReport, getCachedReport } from '@/lib/report-cache';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const month = request.nextUrl.searchParams.get('month');
  if (month && !MONTH_REGEX.test(month)) {
    return fail('Parâmetro month deve estar no formato YYYY-MM', 400);
  }

  return handleRequest(async () => {
    const now = new Date();
    const [year, monthIndex] = month
      ? [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1]
      : [now.getFullYear(), now.getMonth()];
    const from = new Date(year, monthIndex, 1);
    const to = new Date(year, monthIndex + 1, 1);

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isClosedMonth = to.getTime() <= startOfCurrentMonth.getTime();
    const cacheKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    // Escopo da sessão: empresa vê só os próprios números; papel de sistema
    // (sem clínica) mantém a visão cross-empresa.
    const tenant = sessionScope(guard.session);
    const { clinicId } = tenant;
    const cached = isClosedMonth
      ? getCachedReport(clinicId, cacheKey)
      : undefined;
    if (cached) {
      return cached;
    }

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
  });
}
