import type { Procedure as CatalogProcedure } from '@/domain/catalog/procedure';

export interface ProcedureDto {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
  /** Nº de insumos no kit padrão — "Kit" deixa de ser opaco na listagem (PROC-03). */
  kitItemCount: number;
}

export const toProcedureDto = (
  procedure: CatalogProcedure,
  kitItemCount = 0,
): ProcedureDto => ({
  id: procedure.id,
  name: procedure.name,
  priceCents: procedure.priceCents,
  durationMinutes: procedure.durationMinutes,
  active: procedure.isActive,
  kitItemCount,
});
