import type { NextRequest } from 'next/server';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import {
  getMonthlyReportFor,
  REPORT_MONTH_REGEX,
} from '@/lib/server/data/reports';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const month = request.nextUrl.searchParams.get('month');
  if (month && !REPORT_MONTH_REGEX.test(month)) {
    return fail('Parâmetro month deve estar no formato YYYY-MM', 400);
  }

  return handleRequest(() =>
    getMonthlyReportFor(guard.session, month ?? undefined),
  );
}
