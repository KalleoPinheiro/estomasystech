import type { NextRequest } from 'next/server';
import { ConfirmOwnAppointment } from '@/application/portal/confirm-own-appointment';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toPortalAppointmentDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { patients, appointments } = await getRepositories(
      writeScope(session),
    );
    const confirmed = await new ConfirmOwnAppointment(
      patients,
      appointments,
    ).execute({
      email: session.subject,
      appointmentId: id,
    });
    return toPortalAppointmentDto(confirmed);
  });
}
