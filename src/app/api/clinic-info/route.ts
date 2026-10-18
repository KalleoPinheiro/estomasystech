import type { NextRequest } from 'next/server';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { type ClinicInfoDto, toClinicInfoDto } from '@/lib/dto';

/** Neutro, usado só quando a clínica não tem `name` gravado (nunca deveria faltar — defensivo). */
const DEFAULT_NAME = 'EstomaSysTech — Clínica de Estomaterapia';

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async (): Promise<ClinicInfoDto> => {
    const { clinics } = await getRepositories(clinicScope(clinicId));
    const clinic = await clinics.findById(clinicId);
    if (!clinic) {
      return {
        name: DEFAULT_NAME,
        cnpj: null,
        address: null,
        city: null,
        professionalName: null,
        professionalRegistry: null,
      };
    }
    return toClinicInfoDto(clinic);
  });
}
