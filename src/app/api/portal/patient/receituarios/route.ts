import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { listPortalPrescriptions } from '@/lib/server/portal-prescriptions';

/** Receituários emitidos para o paciente da sessão (#956, ADR-116). */
export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listPortalPrescriptions(guard.session));
}
