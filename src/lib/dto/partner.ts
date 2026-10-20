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
  /** Origem do último aceite: `portal` (paciente) ou `paper` (equipe, termo em papel — #310). */
  acceptedSource: 'portal' | 'paper' | null;
  /** Quem da equipe lançou o aceite em papel; só na ficha (a equipe), nunca no portal do paciente. */
  acceptedBy: string | null;
  revokedAt: string | null;
  revokedBy: 'patient' | 'staff' | null;
  /** Parentesco do representante que aceitou pelo menor (#375); nulo = o paciente ou a equipe. */
  signedByRelationship?: string | null;
  /** O aceite do representante venceu (90 dias após os 18): o parceiro não vê nada. */
  representativeExpired?: boolean;
}

export const toPartnerShareConsentDto = (
  view: PartnerShareConsentView,
  consent: { text: string; version: string },
  options: { includeRecordedBy?: boolean } = {},
): PartnerShareConsentDto => {
  const { current, latestAccept, active } = view.status;
  const revocation = current?.kind === 'revoke' ? current : null;
  const revoked = revocation !== null;
  return {
    partnerName: view.partner.fullName,
    consentText: consent.text,
    textVersion: consent.version,
    active,
    revoked,
    acceptedAt: latestAccept?.recordedAt.toISOString() ?? null,
    acceptedVersion: latestAccept?.textVersion ?? null,
    acceptedSource: latestAccept?.source ?? null,
    acceptedBy: options.includeRecordedBy
      ? (latestAccept?.recordedBy ?? null)
      : null,
    revokedAt: revocation?.recordedAt.toISOString() ?? null,
    revokedBy: revocation?.actor ?? null,
    signedByRelationship: latestAccept?.signer?.relationship ?? null,
    representativeExpired: view.status.representativeExpired,
  };
};
