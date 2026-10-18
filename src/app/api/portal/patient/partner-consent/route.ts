import type { NextRequest } from 'next/server';
import {
  acceptPartnerShareConsent,
  getPartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import {
  ADULT_TITULAR_ONLY_MESSAGE,
  resolveConsentSigner,
} from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';
import { toPartnerShareConsentDto } from '@/lib/dto';
import { PARTNER_SHARE_CONSENT as CONSENT } from '@/lib/partner-share-consent-text';

/**
 * Consentimento do paciente logado para o parceiro que o indicou ver
 * condições e avaliações (#292). `null` quando não há parceiro indicador.
 * O representante legal decide pelo menor (#375, ADR-033).
 */
export async function GET(request: NextRequest) {
  const auth = requirePatientPortalSession(request);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const services = await getRepositories(sessionScope(auth.session));
    const { patient } = await resolveConsentSigner(
      services,
      auth.session,
      ADULT_TITULAR_ONLY_MESSAGE,
    );
    const view = await getPartnerShareConsent(services, patient, CONSENT);
    return view ? toPartnerShareConsentDto(view, CONSENT) : null;
  });
}

/** Aceite: grava hash do texto exato, versão, data e IP (evidência LGPD). */
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
    const { record, created } = await acceptPartnerShareConsent(
      services,
      patient,
      CONSENT,
      clientIp(request),
      signer,
    );
    if (created) {
      recordAudit(services.auditEvents, auth.session, {
        action: 'create',
        resourceType: 'partner-consent',
        resourceId: record.id,
        patientId: patient.id,
        detail: `parceiro ${record.partnerId}; versão ${record.textVersion}${signer ? '; pelo representante legal' : ''}`,
      });
    }
    return { active: true, acceptedAt: record.recordedAt.toISOString() };
  });
}
