import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toProcedureOptionDto } from '@/lib/dto';

/**
 * Catálogo de procedimentos para agendar e para a lista de espera (#188):
 * família `operational`, sem kit de insumos. Escrita e kit seguem em
 * `/api/procedures` (administrativo).
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { procedures } = await getRepositories(sessionScope(guard.session));
    const result = await procedures.findAll();
    return result.map(toProcedureOptionDto);
  });
}
