import type { NextRequest } from 'next/server';
import {
  findPatientOrThrow,
  getPartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toPartnerShareConsentDto } from '@/lib/dto';
import { PARTNER_SHARE_CONSENT } from '@/lib/partner-share-consent-text';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Status do consentimento do paciente para o parceiro que o indicou (#292),
 * na ficha. `null` quando o paciente não tem parceiro indicador ativo.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      services.professionalPatientLinks,
    );
    const patient = await findPatientOrThrow(services.patients, id);
    const view = await getPartnerShareConsent(
      services,
      patient,
      PARTNER_SHARE_CONSENT,
    );
    return view ? toPartnerShareConsentDto(view, PARTNER_SHARE_CONSENT) : null;
  });
}
