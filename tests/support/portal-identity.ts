import type { PartnerRepository } from '@/domain/partner/partner-repository';
import type { PatientRepository } from '@/domain/patient/patient-repository';

/**
 * Os use cases do portal recebem o titular já resolvido pelo vínculo da conta
 * (#196). Nos testes de use case, o cadastro é localizado pelo e-mail com que
 * foi semeado; e-mail sem cadastro vira um id inexistente — o mesmo NotFound.
 */
export const portalPatientId = async (
  patients: PatientRepository,
  email: string,
): Promise<string> =>
  (await patients.findByEmail(email))?.id ?? `sem-cadastro:${email}`;

export const portalPartnerId = async (
  partners: PartnerRepository,
  email: string,
): Promise<string> =>
  (await partners.findByEmail(email))?.id ?? `sem-cadastro:${email}`;
