import type { NextRequest } from 'next/server';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/** Horários livres para o paciente agendar um retorno ou remarcar (PORT4-01..03). */
export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
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
    const services = await getRepositories(sessionScope(session));
    const {
      patients,
      appointments,
      procedures,
      scheduleConfig,
      scheduleAvailability,
    } = services;
    const { id: patientId } = await resolvePortalPatient(services, session);
    const slots = await new ListAvailableSlots(
      patients,
      appointments,
      procedures,
      scheduleConfig,
      scheduleAvailability,
    ).execute(
      appointmentId
        ? { patientId, appointmentId, date }
        : { patientId, procedureId: procedureId as string, date },
    );

    return slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    }));
  });
}
