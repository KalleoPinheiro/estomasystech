import type { NextRequest } from 'next/server';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/** Horários livres para o paciente agendar um retorno ou remarcar (PORT4-01..03). */
export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const params = request.nextUrl.searchParams;
  const procedureId = params.get('procedureId');
  // Remarcação: a duração e o profissional vêm da própria consulta.
  const appointmentId = params.get('appointmentId');
  const date = params.get('date');
  if (!date || Boolean(procedureId) === Boolean(appointmentId)) {
    return fail(
      'Informe date (AAAA-MM-DD) e procedureId ou appointmentId',
      400,
    );
  }

  return handleRequest(async () => {
    // Grade, conflitos e catálogo são os da clínica do paciente — nunca de
    // outra empresa.
    const {
      patients,
      appointments,
      procedures,
      scheduleConfig,
      scheduleAvailability,
    } = await getRepositories(sessionScope(session));
    const slots = await new ListAvailableSlots(
      patients,
      appointments,
      procedures,
      scheduleConfig,
      scheduleAvailability,
    ).execute(
      appointmentId
        ? { email: session.subject, appointmentId, date }
        : { email: session.subject, procedureId: procedureId as string, date },
    );

    return slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    }));
  });
}
