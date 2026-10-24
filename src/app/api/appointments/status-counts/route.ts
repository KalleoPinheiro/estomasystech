import type { NextRequest } from 'next/server';
import { CountAppointmentsByStatus } from '@/application/appointments/count-appointments-by-status';
import { APPOINTMENT_STATUSES } from '@/domain/scheduling/appointment';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/** Contagem por status do período, para os chips do filtro da agenda (AGE-FLT-05). */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (!from || !to) {
    return fail('Parâmetros obrigatórios: from, to (ISO 8601)', 400);
  }
  // Mesmo escopo da listagem: Profissional só conta a própria agenda (R4/RBAC-19).
  const professionalId =
    guard.session.role === 'profissional'
      ? (guard.session.professionalId ?? undefined)
      : (request.nextUrl.searchParams.get('professionalId') ?? undefined);
  return handleRequest(async () => {
    if (
      guard.session.role === 'profissional' &&
      !guard.session.professionalId
    ) {
      return Object.fromEntries(APPOINTMENT_STATUSES.map((s) => [s, 0]));
    }
    const { appointments } = await getRepositories(sessionScope(guard.session));
    return new CountAppointmentsByStatus(appointments).execute({
      from: new Date(from),
      to: new Date(to),
      professionalId,
    });
  });
}
