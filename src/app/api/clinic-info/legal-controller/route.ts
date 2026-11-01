import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { getLegalControllerFor } from '@/lib/server/data/clinic-info';

/**
 * Clínica e encarregado que entram nos termos impressos (#216, ADR-030). Como
 * `/api/clinic-info`, qualquer papel de equipe lê: quem imprime o termo na
 * recepção não é só o Admin. Sem CNPJ ou canal do encarregado, `409`.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => getLegalControllerFor(guard.session));
}
