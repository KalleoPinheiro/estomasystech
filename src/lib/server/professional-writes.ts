import {
  type CommissionType,
  Professional,
} from '@/domain/professional/professional';
import type { ProfessionalRepository } from '@/domain/professional/professional-repository';
import { NotFoundError } from '@/domain/shared/errors';

export interface ProfessionalInput {
  fullName: string;
  registry?: string | null;
  commissionType?: CommissionType;
  commissionPct?: number | null;
  commissionFixedCents?: number | null;
}

export interface ProfessionalChange extends Partial<ProfessionalInput> {
  active?: boolean;
}

/** Cadastra o profissional; a regra é a de `POST /api/professionals`. */
export async function createProfessionalRecord(
  professionals: ProfessionalRepository,
  input: ProfessionalInput,
): Promise<Professional> {
  const professional = Professional.create({
    fullName: input.fullName,
    registry: input.registry ?? null,
    commissionType: input.commissionType,
    commissionPct: input.commissionPct ?? null,
    commissionFixedCents: input.commissionFixedCents ?? null,
  });
  await professionals.save(professional);
  return professional;
}

/** Edita, ativa ou desativa; a regra é a de `PATCH /api/professionals/:id`. */
export async function updateProfessionalRecord(
  professionals: ProfessionalRepository,
  id: string,
  change: ProfessionalChange,
): Promise<Professional> {
  const existing = await professionals.findById(id);
  if (!existing) throw new NotFoundError('Profissional', id);
  let updated = existing.update({
    fullName: change.fullName,
    registry: change.registry,
    commissionType: change.commissionType,
    commissionPct: change.commissionPct,
    commissionFixedCents: change.commissionFixedCents,
  });
  if (change.active === true) updated = updated.reactivate();
  if (change.active === false) updated = updated.deactivate();
  await professionals.save(updated);
  return updated;
}
