import type { UserRole } from '@/domain/auth/user-role';

/** Os 4 papéis de equipe (excluem os portais Patient/Partner). */
export const STAFF_ROLES: readonly UserRole[] = [
  'super_admin',
  'company_admin',
  'atendente',
  'profissional',
];

/**
 * Equipe da clínica: os papéis de equipe menos o super_admin, que é operador
 * da plataforma e não entra em tela nem API da clínica (ADR-007).
 */
export const CLINIC_STAFF_ROLES: readonly UserRole[] = STAFF_ROLES.filter(
  (role) => role !== 'super_admin',
);

export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}
