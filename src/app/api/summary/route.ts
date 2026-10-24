import type { NextRequest } from 'next/server';
import { ListAppointments } from '@/application/appointments/list-appointments';
import { GetBillingSummary } from '@/application/billing/get-billing-summary';
import {
  startOfZonedDay,
  startOfZonedDayAfter,
  startOfZonedMonth,
  zonedParts,
} from '@/domain/shared/time-zone';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toAppointmentDto } from '@/lib/dto';

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
    const current = zonedParts(now);
    const [year, monthNumber] = month
      ? [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
      : [current.year, current.month];
    const from = startOfZonedMonth(year, monthNumber);
    const to = startOfZonedMonth(year, monthNumber + 1);

    const startOfToday = startOfZonedDay(
      current.year,
      current.month,
      current.day,
    );
    const endOfToday = startOfZonedDayAfter(now);

    // Escopo da sessão: o painel de uma empresa nunca soma faturamento nem
    // lista consultas (com nome de paciente) de outra.
    const { appointments, patients, invoices } = await getRepositories(
      sessionScope(guard.session),
    );
    const [billing, monthStats, todayAppointments] = await Promise.all([
      new GetBillingSummary(invoices).execute({ from, to }),
      appointments.getStatsInRange(from, to),
      new ListAppointments(appointments, patients).execute({
        from: startOfToday,
        to: endOfToday,
      }),
    ]);

    const appointmentsInMonth = Object.values(monthStats.byStatus).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      billing,
      appointmentsInMonth,
      today: todayAppointments.map(
        ({ appointment, patientName, patientBirthDate }) =>
          toAppointmentDto(appointment, patientName, patientBirthDate),
      ),
    };
  });
}
