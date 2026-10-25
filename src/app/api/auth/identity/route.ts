import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { buildSidebarIdentity } from '@/lib/server/data/identity';

/** Identidade da sessão ativa pra sidebar (issue #126) — clínica real + conta logada, nunca texto fixo. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => buildSidebarIdentity(guard.session));
}
