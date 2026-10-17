import type { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

/** Conta de acesso — nunca expõe o hash de senha. */
export interface UserAccountDto {
  id: string;
  email: string;
  role: UserRole;
  professionalId: string | null;
  active: boolean;
  /** Anonimizada pela retenção: sem reativação, só convite novo (#311). */
  anonymized: boolean;
  /** `false` = conta nunca logou (convite ainda não consumido) — habilita reenvio na UI. */
  passwordSet: boolean;
}

export const toUserAccountDto = (account: UserAccount): UserAccountDto => ({
  id: account.id,
  email: account.email,
  role: account.role,
  professionalId: account.professionalId,
  active: account.isActive,
  anonymized: account.isAnonymized,
  passwordSet: account.passwordHash !== UNSET_PASSWORD_HASH,
});
