import type { NextRequest } from 'next/server';
import {
  findPatientOrThrow,
  revokePartnerShareConsent,
} from '@/application/partners/partner-share-consent';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { clientIp } from '@/lib/auth/client-ip';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Revogação pela equipe, na ficha (#292) — ex.: o paciente pediu na
 * recepção. A equipe só revoga; o aceite é sempre do próprio paciente.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const services = await getRepositories(writeScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      services.professionalPatientLinks,
    );
    const patient = await findPatientOrThrow(services.patients, id);
    const record = await revokePartnerShareConsent(
      services,
      patient,
      'staff',
      clientIp(request),
    );
    recordAudit(services.auditEvents, guard.session, {
      action: 'update',
      resourceType: 'partner-consent',
      resourceId: record.id,
      patientId: patient.id,
      detail: `revogação pela equipe; parceiro ${record.partnerId}`,
    });
    return { active: false, revokedAt: record.recordedAt.toISOString() };
  });
}
