import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { getClinicInfoFor } from '@/lib/server/data/clinic-info';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => getClinicInfoFor(guard.session));
}
