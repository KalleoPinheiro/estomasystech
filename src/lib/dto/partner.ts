import type { PartnerShareConsentView } from '@/application/partners/partner-share-consent';
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

/** Consentimento de compartilhamento com o parceiro indicador (#292). */
export interface PartnerShareConsentDto {
  partnerName: string;
  consentText: string;
  textVersion: string;
  active: boolean;
  revoked: boolean;
  /** Data e versão do último ACEITE, mesmo se revogado depois. */
  acceptedAt: string | null;
  acceptedVersion: string | null;
  revokedAt: string | null;
  revokedBy: 'patient' | 'staff' | null;
}

export const toPartnerShareConsentDto = (
  view: PartnerShareConsentView,
  consent: { text: string; version: string },
): PartnerShareConsentDto => {
  const { current, latestAccept, active } = view.status;
  const revoked = current?.kind === 'revoke';
  return {
    partnerName: view.partner.fullName,
    consentText: consent.text,
    textVersion: consent.version,
    active,
    revoked,
    acceptedAt: latestAccept?.recordedAt.toISOString() ?? null,
    acceptedVersion: latestAccept?.textVersion ?? null,
    revokedAt: revoked ? (current?.recordedAt.toISOString() ?? null) : null,
    revokedBy: revoked ? (current?.actor ?? null) : null,
  };
};
