import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { AddToWaitlist } from '@/application/scheduling/waitlist';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { portalActorNoun } from '@/lib/auth/portal-actor';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { loadMyWaitlist } from '@/lib/server/data/portal';
import { waitlistWithNames } from '@/lib/waitlist-names';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const joinSchema = z.object({
  procedureId: z.string().min(1),
  fromDate: z.string().regex(DATE),
  toDate: z.string().regex(DATE),
  notes: z.string().max(500).nullish(),
});

/** Pedidos do próprio paciente ainda na fila. */
export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(() => loadMyWaitlist(session));
}

/** Paciente entra na lista de espera quando não acha horário (portal). */
export async function POST(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const body = joinSchema.parse(await request.json());
    const services = await getRepositories(writeScope(session));
    const patient = await resolvePortalPatient(services, session);
    const entry = await new AddToWaitlist(
      services.waitlist,
      services.patients,
      services.procedures,
      services.professionals,
    ).execute({ ...body, patientId: patient.id, source: 'patient' });

    recordAudit(services.auditEvents, session, {
      action: 'create',
      resourceType: 'waitlist-entry',
      resourceId: entry.id,
      patientId: entry.patientId,
      detail: `pelo portal do ${portalActorNoun(session)}`,
    });
    const [dto] = await waitlistWithNames(services, [entry]);
    return dto;
  });
}
