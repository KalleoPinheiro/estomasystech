import type { NextRequest } from 'next/server';
import {
  findPatientOrThrow,
  getPartnerShareConsent,
  registerPaperPartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { getRepositories } from '@/infrastructure/container';
import { fail, handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toPartnerShareConsentDto } from '@/lib/dto';
import { PARTNER_SHARE_CONSENT } from '@/lib/partner-share-consent-text';

type RouteContext = { params: Promise<{ id: string }> };

const PAPER_CONSENT_ROLES = ['company_admin', 'atendente'];

const PAPER_CONSENT_FORBIDDEN_MESSAGE =
  'Só o Admin de Empresa e o Atendente registram o consentimento dado em papel';

/**
 * Consentimento dado em papel, lançado pela equipe na ficha (#310). Só o Admin
 * de Empresa e o Atendente (decisão de @KalleoPinheiro na #310); o Profissional
 * recebe 403. Libera o dado ao parceiro como o aceite pelo portal, mas grava a
 * origem `papel` e quem lançou, e entra na trilha de auditoria.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  if (guard.session && !PAPER_CONSENT_ROLES.includes(guard.session.role)) {
    return fail(PAPER_CONSENT_FORBIDDEN_MESSAGE, 403);
  }

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(writeScope(guard.session));
    const patient = await findPatientOrThrow(services.patients, id);
    const { record, created } = await registerPaperPartnerShareConsent(
      services,
      patient,
      PARTNER_SHARE_CONSENT,
      guard.session?.subject ?? 'anonymous',
      clientIp(request),
    );
    if (created) {
      recordAudit(services.auditEvents, guard.session, {
        action: 'create',
        resourceType: 'partner-consent',
        resourceId: record.id,
        patientId: patient.id,
        detail: `consentimento em papel lançado pela equipe; parceiro ${record.partnerId}; texto ${record.textVersion}`,
      });
    }
    const view = await getPartnerShareConsent(
      services,
      patient,
      PARTNER_SHARE_CONSENT,
    );
    return view
      ? toPartnerShareConsentDto(view, PARTNER_SHARE_CONSENT, {
          includeRecordedBy: true,
        })
      : null;
  });
}
