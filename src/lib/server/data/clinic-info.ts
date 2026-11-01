import 'server-only';
import { NotFoundError } from '@/domain/shared/errors';
import { getRepositories } from '@/infrastructure/container';
import type { Session } from '@/lib/auth/session';
import { clinicScope, writeClinicId } from '@/lib/auth/tenant-scope';
import { type ClinicInfoDto, toClinicInfoDto } from '@/lib/dto';
import { controllerFromClinic, type LegalController } from '@/lib/legal-text';

/** Neutro, usado só quando a clínica não tem `name` gravado (nunca deveria faltar — defensivo). */
const DEFAULT_NAME = 'EstomaSysTech — Clínica de Estomaterapia';

/**
 * Cabeçalho da clínica nos documentos impressos (#546). Mesma resposta de
 * `GET /api/clinic-info`, que chama esta função. Qualquer papel de equipe lê.
 */
export async function getClinicInfoFor(
  session: Session,
): Promise<ClinicInfoDto> {
  const clinicId = writeClinicId(session);
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
}

/**
 * Clínica e encarregado que entram nos termos impressos (#216, ADR-030). Mesma
 * resposta de `GET /api/clinic-info/legal-controller`. Sem CNPJ ou canal do
 * encarregado, `409`.
 */
export async function getLegalControllerFor(
  session: Session,
): Promise<LegalController> {
  const clinicId = writeClinicId(session);
  const { clinics } = await getRepositories(clinicScope(clinicId));
  const clinic = await clinics.findById(clinicId);
  if (!clinic) throw new NotFoundError('Clínica', clinicId);
  return controllerFromClinic(clinic);
}
