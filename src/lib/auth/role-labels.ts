import type { UserRole } from '@/domain/auth/user-role';

/** Rótulos legíveis dos 4 papéis de equipe — usados na identificação da sessão ativa (issue #126). */
export const STAFF_ROLE_LABELS: Partial<Record<UserRole, string>> = {
  super_admin: 'Super Admin',
  company_admin: 'Admin de Empresa',
  atendente: 'Atendente',
  profissional: 'Profissional',
};

export function staffRoleLabel(role: UserRole): string {
  return STAFF_ROLE_LABELS[role] ?? role;
}
