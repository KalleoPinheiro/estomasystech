import type { NextRequest } from 'next/server';
import { revokePartnerShareConsent } from '@/application/partners/partner-share-consent';
import { resolvePortalPatient } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requirePortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

/**
 * Revogação pelo próprio paciente (#292): registro novo e imutável; o aceite
 * original fica no histórico. Repetir só grava outra revogação.
 */
export async function POST(request: NextRequest) {
  const auth = requirePortalSession(request, 'patient');
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const services = await getRepositories(writeScope(auth.session));
    const patient = await resolvePortalPatient(services, auth.session);
    const record = await revokePartnerShareConsent(
      services,
      patient,
      'patient',
      clientIp(request),
    );
    recordAudit(services.auditEvents, auth.session, {
      action: 'update',
      resourceType: 'partner-consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `revogação pelo paciente; parceiro ${record.partnerId}`,
    });
    return { active: false, revokedAt: record.recordedAt.toISOString() };
  });
}
