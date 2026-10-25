import type { NextRequest } from 'next/server';
import { startOfZonedDayAfter } from '@/domain/shared/time-zone';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { listAppointmentsFor } from '@/lib/server/data/appointments';
import { buildMonthSummary } from '@/lib/server/data/month-summary';

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
    const [summary, today] = await Promise.all([
      buildMonthSummary(guard.session, month ?? undefined, now),
      listAppointmentsFor(guard.session, {
        from: startOfZonedDayAfter(now, 0),
        to: startOfZonedDayAfter(now),
      }),
    ]);
    return { ...summary, today };
  });
}
