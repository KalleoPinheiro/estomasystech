import type { NextRequest } from 'next/server';
import { ConfirmOwnAppointment } from '@/application/portal/confirm-own-appointment';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toPortalAppointmentDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(writeScope(session));
    const { patients, appointments } = services;
    const confirmed = await new ConfirmOwnAppointment(
      patients,
      appointments,
    ).execute({
      patientId: (await resolvePortalPatient(services, session)).id,
      appointmentId: id,
    });
    return toPortalAppointmentDto(confirmed);
  });
}
