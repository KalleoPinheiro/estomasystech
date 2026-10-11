import type { UserRole } from '../auth/user-role';
import { ForbiddenError } from '../shared/errors';

/** Quem registra ou remove um bloqueio de agenda (feriado ou ausência). */
export interface ClosureActor {
  role: UserRole;
  /** Profissional vinculado à conta; `null` se a conta não tem vínculo. */
  professionalId: string | null;
}

const MANAGES_ANY_CLOSURE: readonly UserRole[] = ['company_admin', 'atendente'];

/**
 * Decisão de @KalleoPinheiro (#215, AGE-RN-13): Admin de Empresa e Atendente
 * cadastram feriados da clínica e ausências de qualquer profissional; o
 * Profissional, só a própria ausência. `actor` nulo é o modo aberto de
 * desenvolvimento (sem autenticação), que não restringe — como a guarda de
 * equipe (`requireStaffSession`).
 */
export function canManageClosure(
  actor: ClosureActor | null,
  closureProfessionalId: string | null,
): boolean {
  if (actor === null || MANAGES_ANY_CLOSURE.includes(actor.role)) {
    return true;
  }
  return (
    actor.role === 'profissional' &&
    actor.professionalId !== null &&
    closureProfessionalId === actor.professionalId
  );
}

export function assertCanManageClosure(
  actor: ClosureActor | null,
  closureProfessionalId: string | null,
): void {
  if (!canManageClosure(actor, closureProfessionalId)) {
    throw new ForbiddenError(
      'Profissional registra e remove só a própria ausência',
    );
  }
}
