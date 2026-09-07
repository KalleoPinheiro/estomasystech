import type { Partner } from '@/domain/partner/partner';

export interface PartnerDto {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  crm: string | null;
  specialty: string | null;
  active: boolean;
}

export const toPartnerDto = (partner: Partner): PartnerDto => ({
  id: partner.id,
  fullName: partner.fullName,
  email: partner.email,
  phone: partner.phone,
  crm: partner.crm,
  specialty: partner.specialty,
  active: partner.isActive,
});
