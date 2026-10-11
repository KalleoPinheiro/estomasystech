import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CreateScheduleClosure } from '@/application/scheduling/schedule-availability';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toScheduleClosureDto } from '@/lib/dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  professionalId: z.string().min(1).nullish(),
  startsOn: z.string().regex(DATE),
  endsOn: z.string().regex(DATE).nullish(),
  reason: z.string().max(200),
});

/** Feriados, recessos e ausências que tocam o intervalo `from`..`to`. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  if (!from || !to || !DATE.test(from) || !DATE.test(to)) {
    return fail('Informe from e to (AAAA-MM-DD)', 400);
  }

  return handleRequest(async () => {
    const { scheduleAvailability } = await getRepositories(
      sessionScope(guard.session),
    );
    const closures = await scheduleAvailability.listClosures({ from, to });
    return closures.map(toScheduleClosureDto);
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    const services = await getRepositories(writeScope(guard.session));
    // A sessão é o ator: o caso de uso aplica a regra por papel (#215).
    const { closure, affectedAppointments } = await new CreateScheduleClosure(
      services.scheduleAvailability,
      services.professionals,
      services.appointments,
    ).execute(body, guard.session);

    recordAudit(services.auditEvents, guard.session, {
      action: 'create',
      resourceType: 'schedule-closure',
      resourceId: closure.id,
      detail: `${closure.startsOn}..${closure.endsOn}: ${closure.reason}`,
    });
    return {
      closure: toScheduleClosureDto(closure),
      affectedAppointments: affectedAppointments.map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.slot.start.toISOString(),
        procedure: appointment.procedure,
      })),
    };
  });
}
