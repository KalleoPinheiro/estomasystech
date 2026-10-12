import { ValidationError } from '@/domain/shared/errors';
import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Política de senha de todas as contas (#291, #309; decisões do dono em
 * 2026-10-11 e 2026-10-12): mínimo de 10 caracteres e recusa das senhas
 * comuns de uma lista embutida, sem chamada externa. Vale para equipe, paciente
 * e parceiro, ao definir (convite/redefinição) e ao trocar; senha antiga
 * continua valendo até a próxima troca.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_TOO_SHORT_MESSAGE = `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`;
export const COMMON_PASSWORD_MESSAGE =
  'Essa senha é muito comum e fácil de adivinhar. Escolha outra.';

/** Comparação sem maiúsculas e sem espaços nas pontas: `Senha12345 ` é `senha12345`. */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

/** Mensagem do primeiro problema da senha, ou `null` se ela serve. */
export function passwordPolicyViolation(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  return isCommonPassword(password) ? COMMON_PASSWORD_MESSAGE : null;
}

export function assertPasswordPolicy(password: string): void {
  const violation = passwordPolicyViolation(password);
  if (violation) throw new ValidationError(violation);
}
