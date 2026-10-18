import type { NextRequest } from 'next/server';
import { keepGuardianAfterMajority } from '@/application/guardians/majority-review';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { assertCanManageGuardians } from '@/lib/auth/guardian-access';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';

type RouteContext = { params: Promise<{ patientId: string }> };

/**
 * A clínica mantém o acesso com o responsável depois dos 18 anos (#372,
 * ADR-032). A decisão vai para a trilha antes de gravar (write-ahead).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    assertCanManageGuardians(guard.session);
    const { patientId } = await context.params;
    const repos = await getRepositories(writeScope(guard.session));
    const patient = await keepGuardianAfterMajority(repos, patientId, () =>
      recordAuditNow(repos.auditEvents, guard.session, {
        action: 'update',
        resourceType: 'patient',
        resourceId: patientId,
        patientId,
        detail: 'maioridade: acesso ao portal mantido com o responsável',
      }),
    );
    return {
      patientId: patient.id,
      majorityReviewedAt: patient.majorityReviewedAt?.toISOString() ?? null,
    };
  });
}
