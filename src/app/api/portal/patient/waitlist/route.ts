import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AddToWaitlist } from '@/application/scheduling/waitlist';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { waitlistWithNames } from '@/lib/waitlist-names';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const joinSchema = z.object({
  procedureId: z.string().min(1),
  fromDate: z.string().regex(DATE),
  toDate: z.string().regex(DATE),
  notes: z.string().max(500).nullish(),
});

async function ownPatient(
  patients: Awaited<ReturnType<typeof getRepositories>>['patients'],
  email: string,
) {
  const patient = await patients.findByEmail(email);
  if (!patient?.isActive) {
    throw new NotFoundError('Paciente', email);
  }
  return patient;
}

/** Pedidos do próprio paciente ainda na fila. */
export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const services = await getRepositories(sessionScope(session));
    const patient = await ownPatient(services.patients, session.subject);
    const entries = (await services.waitlist.findByPatient(patient.id)).filter(
      (entry) => entry.status === 'waiting',
    );
    return waitlistWithNames(services, entries);
  });
}

/** Paciente entra na lista de espera quando não acha horário (portal). */
export async function POST(request: NextRequest) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const body = joinSchema.parse(await request.json());
    const services = await getRepositories(writeScope(session));
    const patient = await ownPatient(services.patients, session.subject);
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
      detail: 'pelo portal do paciente',
    });
    const [dto] = await waitlistWithNames(services, [entry]);
    return dto;
  });
}
