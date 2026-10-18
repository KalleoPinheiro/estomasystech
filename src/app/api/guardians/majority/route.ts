import type { NextRequest } from 'next/server';
import { listMajorityReviews } from '@/application/guardians/majority-review';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';

/**
 * Aviso de maioridade (#372, ADR-032): pacientes que fizeram 18 anos e ainda
 * estão no portal só pelo responsável. Quem gerencia responsáveis vê e decide
 * (transferir criando a conta do paciente, ou manter com o responsável).
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const repos = await getRepositories(sessionScope(guard.session));
    return (await listMajorityReviews(repos)).map((item) => ({
      patientId: item.patient.id,
      fullName: item.patient.fullName,
      birthDate: item.patient.birthDate?.toISOString() ?? null,
      guardianName: item.guardianName,
      guardianRelationship: item.guardianRelationship,
    }));
  });
}
