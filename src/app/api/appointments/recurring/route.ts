import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { ScheduleRecurringAppointments } from '@/application/appointments/schedule-recurring-appointments';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { scheduleCalendarSync } from '@/lib/calendar-sync';
import { toAppointmentDto } from '@/lib/dto';

const recurringSchema = z.object({
  patientId: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  procedure: z.string().min(1).max(500),
  priceCents: z.number().int().nonnegative().max(1_000_000_000),
  notes: z.string().max(5000).nullish(),
  professionalId: z.string().max(100).nullish(),
  procedureId: z.string().max(100).nullish(),
  occurrences: z.number().int().min(2).max(24),
  weeksInterval: z.number().int().min(1).max(8).default(1),
});

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
