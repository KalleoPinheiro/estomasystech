import type { UserRole } from './user-role';

/**
 * Regra pura de "quem pode cadastrar quem" (RBAC-07..RBAC-10, ADR-003) — sem
 * I/O, testável isoladamente. O escopo de empresa (o alvo precisa estar na
 * mesma empresa do ator, exceto para super_admin) é responsabilidade do
 * use-case que consome esta regra, não dela.
 *
 * Ninguém cadastra `super_admin` (ADR-007): existe um só, criado pelo
 * bootstrap. O banco garante o mesmo (`ck_user_accounts_system_role_has_no_clinic`
 * + `uq_user_accounts_single_system_account`).
 *
 * super_admin só cadastra `company_admin` (ADR-007): ele é o operador da
 * plataforma, não da clínica — não cria atendente, profissional, paciente
 * nem parceiro (#253).
 */
export const PROVISIONING_MATRIX: Record<UserRole, readonly UserRole[]> = {
  super_admin: ['company_admin'],
  company_admin: [
    'company_admin',
    'atendente',
    'profissional',
    'patient',
    'partner',
    'guardian',
  ],
  atendente: ['patient', 'partner', 'guardian'],
  profissional: ['patient', 'partner'],
  patient: [],
  partner: [],
  guardian: [],
};

export function canProvision(
  actorRole: UserRole,
  targetRole: UserRole,
): boolean {
  return PROVISIONING_MATRIX[actorRole].includes(targetRole);
}
