import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { loadPatientPortal } from '@/lib/server/data/portal';

export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(() => loadPatientPortal(session));
}
