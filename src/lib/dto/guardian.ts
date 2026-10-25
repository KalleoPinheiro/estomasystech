import type { Guardian } from '@/domain/guardian/guardian';

export interface GuardianDto {
  id: string;
  fullName: string;
  relationship: string;
  /** Parentesco por extenso, como a ficha e o documento mostram. */
  relationshipLabel: string;
  phone: string;
  email: string | null;
}

export const toGuardianDto = (guardian: Guardian): GuardianDto => ({
  id: guardian.id,
  fullName: guardian.fullName,
  relationship: guardian.relationship,
  relationshipLabel: guardian.relationshipLabel,
  phone: guardian.phone,
  email: guardian.email,
});

export interface MajorityReviewDto {
  patientId: string;
  fullName: string;
  birthDate: string | null;
  guardianName: string;
  guardianRelationship: string;
  /** Ainda só com o responsável no portal: transferir ou manter (#372). */
  awaitingTransfer?: boolean;
  /** Dia em que o aceite do representante deixa de valer (#375); nulo sem aceite dele. */
  representativeConsentExpiresOn?: string | null;
  representativeConsentExpired?: boolean;
}
