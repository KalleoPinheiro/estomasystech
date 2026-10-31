import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { getPatientPartnerConsent } from '@/lib/server/data/patient-record';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Status do consentimento do paciente para o parceiro que o indicou (#292),
 * na ficha. `null` quando o paciente não tem parceiro indicador ativo.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    getPatientPartnerConsent(guard.session, (await context.params).id),
  );
}
