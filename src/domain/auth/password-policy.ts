import { ValidationError } from '@/domain/shared/errors';
import { COMMON_PASSWORDS } from './common-passwords';
import type { UserRole } from './user-role';

/**
 * Política de senha da equipe (#291, decisão do dono em 2026-10-11): mínimo de
 * 10 caracteres e recusa das senhas comuns de uma lista embutida, sem chamada
 * externa. Vale ao definir (convite/redefinição) e ao trocar; senha antiga
 * continua valendo até a próxima troca. Paciente e parceiro seguem o mínimo
 * de 8 do portal.
 */
export const STAFF_MIN_PASSWORD_LENGTH = 10;
export const PORTAL_MIN_PASSWORD_LENGTH = 8;

export const STAFF_PASSWORD_TOO_SHORT_MESSAGE = `A senha precisa ter ao menos ${STAFF_MIN_PASSWORD_LENGTH} caracteres`;
export const PORTAL_PASSWORD_TOO_SHORT_MESSAGE = `A senha precisa ter ao menos ${PORTAL_MIN_PASSWORD_LENGTH} caracteres`;
export const COMMON_PASSWORD_MESSAGE =
  'Essa senha é muito comum e fácil de adivinhar. Escolha outra.';

const STAFF_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'super_admin',
  'company_admin',
  'atendente',
  'profissional',
]);

export function usesStaffPasswordPolicy(role: UserRole): boolean {
  return STAFF_ROLES.has(role);
}

/** Comparação sem maiúsculas e sem espaços nas pontas: `Senha12345 ` é `senha12345`. */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

/** Mensagem do primeiro problema da senha para o papel, ou `null` se ela serve. */
export function passwordPolicyViolation(
  role: UserRole,
  password: string,
): string | null {
  if (!usesStaffPasswordPolicy(role)) {
    return password.length < PORTAL_MIN_PASSWORD_LENGTH
      ? PORTAL_PASSWORD_TOO_SHORT_MESSAGE
      : null;
  }
  if (password.length < STAFF_MIN_PASSWORD_LENGTH) {
    return STAFF_PASSWORD_TOO_SHORT_MESSAGE;
  }
  return isCommonPassword(password) ? COMMON_PASSWORD_MESSAGE : null;
}

export function assertPasswordPolicy(role: UserRole, password: string): void {
  const violation = passwordPolicyViolation(role, password);
  if (violation) throw new ValidationError(violation);
}
