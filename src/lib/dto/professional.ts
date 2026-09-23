import type {
  CommissionType,
  Professional,
} from '@/domain/professional/professional';

export interface ProfessionalDto {
  id: string;
  fullName: string;
  registry: string | null;
  commissionType: CommissionType;
  commissionPct: number | null;
  commissionFixedCents: number | null;
  active: boolean;
}

export const toProfessionalDto = (
  professional: Professional,
): ProfessionalDto => ({
  id: professional.id,
  fullName: professional.fullName,
  registry: professional.registry,
  commissionType: professional.commissionType,
  commissionPct: professional.commissionPct,
  commissionFixedCents: professional.commissionFixedCents,
  active: professional.isActive,
});
