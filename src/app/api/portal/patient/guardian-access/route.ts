import type { NextRequest } from 'next/server';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { revokeGuardianAccess } from '@/application/portal/revoke-guardian-access';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

/**
 * O paciente encerra o acesso do responsável ao portal (ADR-028). Só o
 * paciente: o responsável (`403`) não revoga a própria autorização.
 */
export async function DELETE(request: NextRequest) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const services = await getRepositories(writeScope(session));
    const patient = await resolvePortalPatient(services, session);
    await revokeGuardianAccess(services, patient, {
      subject: session.subject,
      clinicId: session.clinicId,
    });
    return { revoked: true };
  });
}
