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
