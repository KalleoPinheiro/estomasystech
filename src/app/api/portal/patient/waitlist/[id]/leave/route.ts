import type { NextRequest } from 'next/server';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { ResolveWaitlistEntry } from '@/application/scheduling/waitlist';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toWaitlistEntryDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

/** Paciente sai da lista de espera (só a própria entrada). */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(writeScope(session));
    const patient = await resolvePortalPatient(services, session);
    const entry = await new ResolveWaitlistEntry(services.waitlist).execute(
      id,
      'removed',
      { patientId: patient.id },
    );
    recordAudit(services.auditEvents, session, {
      action: 'update',
      resourceType: 'waitlist-entry',
      resourceId: entry.id,
      patientId: entry.patientId,
      detail: 'saiu da lista pelo portal',
    });
    return toWaitlistEntryDto(entry);
  });
}
