import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { controllerFromClinic, type LegalController } from '@/lib/legal-text';

/**
 * Clínica e encarregado que entram nos termos impressos (#216, ADR-030). Como
 * `/api/clinic-info`, qualquer papel de equipe lê: quem imprime o termo na
 * recepção não é só o Admin. Sem CNPJ ou canal do encarregado, `409`.
 */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async (): Promise<LegalController> => {
    const { clinics } = await getRepositories(clinicScope(clinicId));
    const clinic = await clinics.findById(clinicId);
    if (!clinic) throw new NotFoundError('Clínica', clinicId);
    return controllerFromClinic(clinic);
  });
}
