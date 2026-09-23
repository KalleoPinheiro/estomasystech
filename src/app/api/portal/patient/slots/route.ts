import type { NextRequest } from 'next/server';
import { ListAvailableSlots } from '@/application/portal/list-available-slots';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';

/** Horários livres para o paciente agendar seu retorno (PORT4-01..03). */
export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  const procedureId = request.nextUrl.searchParams.get('procedureId');
  const date = request.nextUrl.searchParams.get('date');
  if (!procedureId || !date) {
    return fail('Informe procedureId e date (AAAA-MM-DD)', 400);
  }

  return handleRequest(async () => {
    // Grade, conflitos e catálogo são os da clínica do paciente — nunca de
    // outra empresa.
    const { patients, appointments, procedures, scheduleConfig } =
      await getRepositories({ clinicId: session.clinicId ?? null });
    const slots = await new ListAvailableSlots(
      patients,
      appointments,
      procedures,
      scheduleConfig,
    ).execute({ email: session.subject, procedureId, date });

    return slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    }));
  });
}
