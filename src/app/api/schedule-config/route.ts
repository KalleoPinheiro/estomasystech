import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { loadScheduleConfig } from '@/lib/server/data/schedule';

/**
 * Leitura da grade da empresa para a agenda de toda a equipe (#215): família
 * `operational`. A edição fica em `/api/settings/schedule`, só do Admin de
 * Empresa — mesma separação de `/api/clinic-info` × `/api/settings/clinic-info`.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => loadScheduleConfig(guard.session));
}
