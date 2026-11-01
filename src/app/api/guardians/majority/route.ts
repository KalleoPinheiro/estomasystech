import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { listMajorityReviewsFor } from '@/lib/server/data/majority';

/**
 * Aviso de maioridade (#372, ADR-032): pacientes que fizeram 18 anos e ainda
 * estão no portal só pelo responsável. Quem gerencia responsáveis vê e decide
 * (transferir criando a conta do paciente, ou manter com o responsável). Também
 * lista o aceite do representante que vence 90 dias após os 18 (#375).
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(() => listMajorityReviewsFor(guard.session));
}
