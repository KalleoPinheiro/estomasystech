import type { NextRequest } from 'next/server';
import { revokePartnerShareConsent } from '@/application/partners/partner-share-consent';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  resolveConsentSigner,
} from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

/**
 * Revogação pelo próprio paciente (#292): registro novo e imutável; o aceite
 * original fica no histórico. Repetir só grava outra revogação. O
 * representante legal revoga pelo menor (#375).
 */
export async function POST(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const services = await getRepositories(writeScope(auth.session));
    const { patient, signer } = await resolveConsentSigner(
      services,
      auth.session,
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const record = await revokePartnerShareConsent(
      services,
      patient,
      'patient',
      clientIp(request),
      null,
      signer,
    );
    recordAudit(services.auditEvents, auth.session, {
      action: 'update',
      resourceType: 'partner-consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `revogação pelo ${signer ? 'representante legal' : 'paciente'}; parceiro ${record.partnerId}`,
    });
    return { active: false, revokedAt: record.recordedAt.toISOString() };
  });
}
