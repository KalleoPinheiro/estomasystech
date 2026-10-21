import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { identityImageResponse } from '@/lib/identity-image-response';

/** Entrega a logo da clínica da sessão — qualquer pessoa da equipe a vê. Envio e remoção: `/api/settings/clinic-logo`. */
export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  const { clinics, photoStorage } = await getRepositories(
    clinicScope(clinicId),
  );
  const clinic = await clinics.findById(clinicId);
  return identityImageResponse(request, photoStorage, clinic?.logoKey ?? null);
}
