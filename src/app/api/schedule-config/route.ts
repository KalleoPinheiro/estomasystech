import type { NextRequest } from 'next/server';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

/**
 * Leitura da grade da empresa para a agenda de toda a equipe (#215): família
 * `operational`. A edição fica em `/api/settings/schedule`, só do Admin de
 * Empresa — mesma separação de `/api/clinic-info` × `/api/settings/clinic-info`.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    // Escopo de escrita, como a leitura antiga: sessão sem empresa (modo
    // aberto) lê a grade da clínica legada, a mesma que a agenda valida.
    const { scheduleConfig } = await getRepositories(writeScope(guard.session));
    const config = await scheduleConfig.get();
    return {
      config: config ?? DEFAULT_SCHEDULE_CONFIG,
      isDefault: config === null,
    };
  });
}
