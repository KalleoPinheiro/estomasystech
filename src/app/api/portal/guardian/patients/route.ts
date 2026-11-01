import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { loadRepresentedPatients } from '@/lib/server/data/portal';

/**
 * Pacientes que o responsável pode representar (ADR-027) e o escolhido agora.
 * Só nome: a escolha não exige dado clínico. Com um único paciente, ele já
 * vale como escolhido, mas a tela continua dizendo em nome de quem age.
 */
export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(() => loadRepresentedPatients(session));
}
