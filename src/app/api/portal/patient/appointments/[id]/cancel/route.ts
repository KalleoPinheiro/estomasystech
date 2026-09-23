import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CancelOwnAppointment } from '@/application/portal/cancel-own-appointment';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toPortalAppointmentDto } from '@/lib/dto';

const cancelSchema = z.object({
  reason: z.string().max(1000).nullish(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Cancelamento da própria consulta pelo paciente, com antecedência mínima. */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = cancelSchema.parse(await request.json().catch(() => ({})));
    const services = await getRepositories(writeScope(session));
    const { appointment: cancelled, changed } = await new CancelOwnAppointment(
      services.patients,
      services.appointments,
      services.scheduleConfig,
    ).execute({
      email: session.subject,
      appointmentId: id,
      reason: body.reason ?? null,
    });

    // Repetição idempotente não gera novo evento nem nova sincronização.
    if (changed) {
      recordAudit(services.auditEvents, session, {
        action: 'update',
        resourceType: 'appointment',
        resourceId: cancelled.id,
        patientId: cancelled.patientId,
        detail: 'cancelada pelo paciente no portal',
      });
      const eventId = cancelled.googleEventId;
      if (eventId) {
        scheduleCalendarSync(services, (sync) => sync.removed(eventId));
      }
    }
    return toPortalAppointmentDto(cancelled);
  });
}
