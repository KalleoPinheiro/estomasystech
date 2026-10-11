import type { NextRequest } from 'next/server';
import { GetPartnerPortalData } from '@/application/portal/get-partner-portal-data';
import { resolvePortalPartner } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import {
  toPartnerDto,
  toPortalAppointmentDto,
  toPortalAssessmentDto,
  toPortalConditionDto,
  toReferredPatientSummaryDto,
} from '@/lib/dto';
import { PARTNER_SHARE_CONSENT_TEXT } from '@/lib/partner-share-consent-text';

export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, 'partner');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    // Escopo da sessão do portal: e-mail pode repetir entre empresas (MT-06),
    // então a busca por e-mail e todo o resto ficam na clínica da conta.
    const services = await getRepositories(sessionScope(session));
    const { partners, patients, appointments, conditions, assessments } =
      services;
    const data = await new GetPartnerPortalData(
      partners,
      patients,
      appointments,
      conditions,
      assessments,
      {
        repository: services.partnerShareConsents,
        consentText: PARTNER_SHARE_CONSENT_TEXT,
      },
    ).execute({
      partnerId: (await resolvePortalPartner(services, session)).id,
    });

    recordAudit(services.auditEvents, session, {
      action: 'read',
      resourceType: 'portal-partner',
      resourceId: data.partner.id,
      detail: `pacientes indicados: ${data.referredPatients.length}; com consentimento: ${data.referredPatients.filter((entry) => entry.sharing).length}`,
    });
    return {
      partner: toPartnerDto(data.partner),
      referredPatients: data.referredPatients.map((entry) => ({
        patient: toReferredPatientSummaryDto(entry.patient),
        sharing: entry.sharing,
        attended: entry.attended,
        appointments: entry.appointments.map(toPortalAppointmentDto),
        conditions: entry.conditions.map(
          ({ condition, assessments: list }) => ({
            condition: toPortalConditionDto(condition),
            assessments: list.map(toPortalAssessmentDto),
          }),
        ),
      })),
    };
  });
}
