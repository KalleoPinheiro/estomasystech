import { Partner, type PartnerProps } from '@/domain/partner/partner';
import type { PartnerRepository } from '@/domain/partner/partner-repository';
import { assertPartnerEmailAvailable, savePartner } from './partner-email';

export class CreatePartner {
  constructor(private readonly partners: PartnerRepository) {}

  async execute(input: PartnerProps): Promise<Partner> {
    await assertPartnerEmailAvailable(this.partners, input.email);
    const partner = Partner.create(input);
    await savePartner(this.partners, partner);
    return partner;
  }
}
