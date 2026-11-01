import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ADMIN_ONLY_MESSAGE } from '@/application/patients/data-subject-requests';
import { DATA_REQUEST_STATUSES } from '@/domain/patient/data-subject-request';
import { fail, handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { listDataRequestsFor } from '@/lib/server/data/data-requests';

const querySchema = z.object({
  status: z.enum(DATA_REQUEST_STATUSES).default('pending'),
});

/**
 * Fila de pedidos do titular da empresa da sessão (#293). Família
 * `administrative` (route-family.ts): só o Admin de Empresa; o handler repete
 * a checagem (ADR-002).
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  if (guard.session && guard.session.role !== 'company_admin') {
    return fail(ADMIN_ONLY_MESSAGE, 403);
  }

  return handleRequest(async () => {
    const { status } = querySchema.parse({
      status: request.nextUrl.searchParams.get('status') ?? undefined,
    });
    return listDataRequestsFor(guard.session, status);
  });
}
