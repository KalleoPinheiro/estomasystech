import type { NextRequest } from 'next/server';
import { CountAppointmentsByStatus } from '@/application/appointments/count-appointments-by-status';
import { APPOINTMENT_STATUSES } from '@/domain/scheduling/appointment';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import {
  appointmentProfessionalScope,
  parseAppointmentRange,
} from '@/lib/auth/appointment-query';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/** Contagem por status do período, para os chips do filtro da agenda (AGE-FLT-05). */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const range = parseAppointmentRange(request);
  if (!range) {
    return fail('Parâmetros obrigatórios: from, to (ISO 8601)', 400);
  }
  // Mesmo escopo da listagem: Profissional só conta a própria agenda (R4/RBAC-19).
  const professional = appointmentProfessionalScope(guard.session, request);
  return handleRequest(async () => {
    if (professional.none) {
      return Object.fromEntries(APPOINTMENT_STATUSES.map((s) => [s, 0]));
    }
    const { appointments } = await getRepositories(sessionScope(guard.session));
    return new CountAppointmentsByStatus(appointments).execute({
      ...range,
      professionalId: professional.professionalId,
    });
  });
}
