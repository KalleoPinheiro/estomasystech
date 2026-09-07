import type { Professional } from '@/domain/professional/professional';

export interface ProfessionalDto {
  id: string;
  fullName: string;
  registry: string | null;
  commissionPct: number | null;
  active: boolean;
}

export const toProfessionalDto = (
  professional: Professional,
): ProfessionalDto => ({
  id: professional.id,
  fullName: professional.fullName,
  registry: professional.registry,
  commissionPct: professional.commissionPct,
  active: professional.isActive,
});
