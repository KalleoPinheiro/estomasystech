import type { Procedure } from '@/domain/catalog/procedure';
import type { Professional } from '@/domain/professional/professional';

/**
 * Opções para os seletores da equipe (agenda, lista de espera, autoria no
 * prontuário) — #188/#189. Diferente de `ProfessionalDto`/`ProcedureDto`, que
 * são do cadastro administrativo: aqui não há comissão, registro nem kit, só o
 * que Atendente e Profissional precisam para escolher e exibir.
 */
export interface ProfessionalOptionDto {
  id: string;
  fullName: string;
  active: boolean;
}

/** Preço e duração entram: o agendamento pelo catálogo preenche os dois. */
export interface ProcedureOptionDto {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
  active: boolean;
}

export const toProfessionalOptionDto = (
  professional: Professional,
): ProfessionalOptionDto => ({
  id: professional.id,
  fullName: professional.fullName,
  active: professional.isActive,
});

export const toProcedureOptionDto = (
  procedure: Procedure,
): ProcedureOptionDto => ({
  id: procedure.id,
  name: procedure.name,
  priceCents: procedure.priceCents,
  durationMinutes: procedure.durationMinutes,
  active: procedure.isActive,
});
