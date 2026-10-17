import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope } from '@/lib/auth/tenant-scope';
import { toPackageBalanceDto } from '@/lib/dto';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Saldo de pacotes do paciente para o prontuário (AD-027, #296): nome e
 * sessões, **sem preço**. Família `clinical` (Admin e Profissional) com o
 * vínculo R4; quem precisa do valor usa `GET /api/packages` (administrativa).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { sessionPackages, procedures, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const packages = await sessionPackages.findByPatientId(id);
    const catalog = await procedures.findAll();
    const nameById = new Map(catalog.map((p) => [p.id, p.name]));
    return packages.map((pkg) =>
      toPackageBalanceDto(pkg, nameById.get(pkg.procedureId)),
    );
  });
}
