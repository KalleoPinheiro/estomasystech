import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { RescheduleOwnAppointment } from '@/application/portal/reschedule-own-appointment';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toPortalAppointmentDto } from '@/lib/dto';

const rescheduleSchema = z.object({
  startsAt: z.iso.datetime(),
});

type RouteContext = { params: Promise<{ id: string }> };

/** Remarcação da própria consulta pelo paciente, com antecedência mínima. */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = rescheduleSchema.parse(await request.json());
    const services = await getRepositories(writeScope(session));

    const rescheduled = await new RescheduleOwnAppointment(
      services.patients,
      services.appointments,
      services.scheduleConfig,
      services.scheduleAvailability,
      services.professionals,
    ).execute({
      patientId: (await resolvePortalPatient(services, session)).id,
      appointmentId: id,
      startsAt: new Date(body.startsAt),
    });

    recordAudit(services.auditEvents, session, {
      action: 'update',
      resourceType: 'appointment',
      resourceId: rescheduled.id,
      patientId: rescheduled.patientId,
      detail: `remarcada pelo paciente no portal para ${rescheduled.slot.start.toISOString()}`,
    });
    scheduleCalendarSync(services, (sync) => sync.rescheduled(rescheduled.id));
    return toPortalAppointmentDto(rescheduled);
  });
}
