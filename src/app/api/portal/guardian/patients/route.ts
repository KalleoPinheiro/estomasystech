import type { NextRequest } from 'next/server';
import { listRepresentablePatients } from '@/application/portal/portal-identity';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requirePatientPortalSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/**
 * Pacientes que o responsável pode representar (ADR-027) e o escolhido agora.
 * Só nome: a escolha não exige dado clínico. Com um único paciente, ele já
 * vale como escolhido, mas a tela continua dizendo em nome de quem age.
 */
export async function GET(request: NextRequest) {
  const guard = requirePatientPortalSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const services = await getRepositories(sessionScope(session));
    const patients = await listRepresentablePatients(services, session);
    const only = patients.length === 1 ? patients[0] : undefined;
    const selected =
      patients.find((p) => p.id === session.actingPatientId) ?? only ?? null;
    return {
      patients: patients.map((p) => ({ id: p.id, fullName: p.fullName })),
      selectedPatientId: selected?.id ?? null,
    };
  });
}
