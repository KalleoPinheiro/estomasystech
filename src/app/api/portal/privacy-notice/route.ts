import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requirePortalSession } from '@/lib/auth/require-session';
import { sessionScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { controllerFromClinic, renderLegalText } from '@/lib/legal-text';
import {
  PRIVACY_NOTICE_TEXT,
  PRIVACY_NOTICE_VERSION,
} from '@/lib/privacy-notice-text';

/** Aviso de privacidade com CNPJ e encarregado da clínica de quem está no portal (qualquer perfil). */
export async function GET(request: NextRequest) {
  const auth = requirePortalSession(request, [
    'patient',
    'guardian',
    'partner',
  ]);
  if (!auth.ok) return auth.response;

  return handleRequest(async () => {
    const { clinics } = await getRepositories(sessionScope(auth.session));
    const clinicId = writeClinicId(auth.session);
    const clinic = await clinics.findById(clinicId);
    if (!clinic) throw new NotFoundError('Clínica', clinicId);
    return {
      version: PRIVACY_NOTICE_VERSION,
      text: renderLegalText(PRIVACY_NOTICE_TEXT, controllerFromClinic(clinic)),
    };
  });
}
