import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { ScheduleOwnAppointment } from '@/application/portal/schedule-own-appointment';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { portalActorNoun } from '@/lib/auth/portal-actor';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toPortalAppointmentDto } from '@/lib/dto';

const scheduleSchema = z.object({
  procedureId: z.string().min(1),
  startsAt: z.iso.datetime(),
  followUpId: z.string().min(1).nullish(),
});

/** Auto-agendamento de retorno pelo paciente (PORT4-04..08). */
export async function POST(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const body = scheduleSchema.parse(await request.json());
    const services = await getRepositories(writeScope(session));

    const appointment = await new ScheduleOwnAppointment(
      services.patients,
      services.appointments,
      services.procedures,
      services.followUps,
      services.scheduleConfig,
      services.scheduleAvailability,
    ).execute({
      patientId: (await resolvePortalPatient(services, session)).id,
      procedureId: body.procedureId,
      startsAt: new Date(body.startsAt),
      followUpId: body.followUpId ?? null,
    });

    recordAudit(services.auditEvents, session, {
      action: 'create',
      resourceType: 'appointment',
      resourceId: appointment.id,
      patientId: appointment.patientId,
      detail: `agendado pelo portal do ${portalActorNoun(session)}`,
    });
    scheduleCalendarSync(services, (sync) => sync.created(appointment.id));
    return toPortalAppointmentDto(appointment);
  });
}
