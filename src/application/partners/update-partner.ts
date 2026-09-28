import type { Partner, PartnerProps } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import { NotFoundError } from '@/domain/shared/errors';
import { assertPartnerEmailAvailable, savePartner } from './partner-email';

export interface UpdatePartnerInput extends Partial<PartnerProps> {
  id: string;
  active?: boolean;
}

export class UpdatePartner {
  constructor(private readonly partners: PartnerRepository) {}

  async execute(input: UpdatePartnerInput): Promise<Partner> {
    const partner = await this.partners.findById(input.id);
    if (!partner) {
      throw new NotFoundError('Parceiro', input.id);
    }
    if (input.email) {
      await assertPartnerEmailAvailable(this.partners, input.email, partner.id);
    }
    let updated = partner.update(input);
    if (input.active !== undefined) {
      updated = input.active ? updated.reactivate() : updated.deactivate();
    }
    await savePartner(this.partners, updated);
    return updated;
  }
}
