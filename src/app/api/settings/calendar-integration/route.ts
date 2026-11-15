import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { loadCalendarStatus } from '@/lib/server/data/settings';

/** Status da conexão do Google Agenda da clínica (issue #124) — nunca é preciso consultar o banco pra saber se conectou. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => loadCalendarStatus(guard.session));
}
