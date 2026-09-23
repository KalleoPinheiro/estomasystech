import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toProcedureDto } from '@/lib/dto';

/**
 * Catálogo ofertável ao paciente no auto-agendamento. Rota própria do portal:
 * o RBAC do proxy é por prefixo e /api/procedures é exclusiva da equipe.
 */
export async function GET(request: NextRequest) {
  const guard = requirePortalSession(request, 'patient');
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    // Catálogo da clínica do paciente, não o de todas as empresas.
    const { procedures } = await getRepositories(sessionScope(guard.session));
    const catalog = await procedures.findAll();
    return catalog
      .filter((procedure) => procedure.isActive)
      .map(toProcedureDto);
  });
}
