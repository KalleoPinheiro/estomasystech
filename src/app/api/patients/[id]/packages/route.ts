import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { listPatientPackageBalances } from '@/lib/server/data/patient-record';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Saldo de pacotes do paciente para o prontuário (AD-027, #296): nome e
 * sessões, **sem preço**. Família `clinical` (Admin e Profissional) com o
 * vínculo R4; quem precisa do valor usa `GET /api/packages` (administrativa).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () =>
    listPatientPackageBalances(guard.session, (await context.params).id),
  );
}
