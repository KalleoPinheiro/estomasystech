import type { Partner } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import { ConflictError } from '@/domain/shared/errors';
import { isUniqueViolation } from '@/lib/db-errors';

export const DUPLICATE_PARTNER_EMAIL_MESSAGE =
  'Já existe parceiro com este e-mail';
const PARTNER_EMAIL_INDEX = 'uq_partners_clinic_email';

/**
 * E-mail do parceiro é único dentro da empresa (#211). O repositório já é
 * escopado, então a mensagem nunca revela cadastro de outra empresa.
 */
export async function assertPartnerEmailAvailable(
  partners: PartnerRepository,
  email: string,
  selfId?: string,
): Promise<void> {
  const owner = await partners.findByEmail(email);
  if (owner && owner.id !== selfId) {
    throw new ConflictError(DUPLICATE_PARTNER_EMAIL_MESSAGE);
  }
}

/**
 * Corrida: duas gravações passam pela checagem prévia e
 * `uq_partners_clinic_email` deixa só uma gravar — a outra vira a mesma
 * mensagem, não `500`.
 */
export async function savePartner(
  partners: PartnerRepository,
  partner: Partner,
): Promise<void> {
  try {
    await partners.save(partner);
  } catch (error) {
    throw isUniqueViolation(error, PARTNER_EMAIL_INDEX)
      ? new ConflictError(DUPLICATE_PARTNER_EMAIL_MESSAGE)
      : error;
  }
}
