import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { loadPartnerPortal } from '@/lib/server/data/portal';

export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, 'partner');
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(() => loadPartnerPortal(session));
}
