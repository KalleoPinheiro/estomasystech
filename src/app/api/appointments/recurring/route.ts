import type { NextRequest } from 'next/server';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recurringSchema } from '@/lib/appointment-schemas';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toAppointmentDto } from '@/lib/dto';
import { ensureLinkBestEffort } from '@/lib/patient-link';

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = recurringSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));

    const result = await new ScheduleRecurringAppointments(
      new ScheduleAppointment(
        services.appointments,
        services.patients,
        services.scheduleConfig,
        services.scheduleAvailability,
        services.professionals,
      ),
    ).execute({
      patientId: body.patientId,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      procedure: body.procedure,
      priceCents: body.priceCents,
      notes: body.notes ?? null,
      professionalId: body.professionalId ?? null,
      procedureId: body.procedureId ?? null,
      occurrences: body.occurrences,
      weeksInterval: body.weeksInterval,
    });

    // Série com profissional concede o vínculo, como o agendamento avulso (PRO-RN-08, #465).
    if (body.professionalId && result.created.length > 0) {
      await ensureLinkBestEffort(
        services.professionalPatientLinks,
        body.professionalId,
        body.patientId,
      );
    }

    for (const appointment of result.created) {
      scheduleCalendarSync(services, (sync) => sync.created(appointment.id));
    }

    return {
      created: result.created.map((appointment) =>
        toAppointmentDto(appointment),
      ),
      skipped: result.skipped.map((skip) => ({
        startsAt: skip.startsAt.toISOString(),
        reason: skip.reason,
      })),
    };
  });
}
