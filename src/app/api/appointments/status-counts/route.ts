import type { NextRequest } from 'next/server';
import { fail, handleRequest } from '@/lib/api-response';
import { parseAppointmentRange } from '@/lib/auth/appointment-query';
import { requireStaffSession } from '@/lib/auth/require-session';
import { countAppointmentsFor } from '@/lib/server/data/appointments';

/** Contagem por status do período, para os chips do filtro da agenda (AGE-FLT-05). */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const range = parseAppointmentRange(request);
  if (!range) {
    return fail('Parâmetros obrigatórios: from, to (ISO 8601)', 400);
  }
  // Mesmo escopo da listagem: Profissional só conta a própria agenda (R4/RBAC-19).
  return handleRequest(() =>
    countAppointmentsFor(guard.session, {
      ...range,
      professionalId:
        request.nextUrl.searchParams.get('professionalId') ?? undefined,
    }),
  );
}
