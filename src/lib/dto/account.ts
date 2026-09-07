import type { UserAccount } from '@/domain/auth/user-account';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

/** Conta de acesso — nunca expõe o hash de senha. */
export interface UserAccountDto {
  id: string;
  email: string;
  professionalId: string | null;
  active: boolean;
  /** `false` = conta nunca logou (convite ainda não consumido) — habilita reenvio na UI. */
  passwordSet: boolean;
}

export const toUserAccountDto = (account: UserAccount): UserAccountDto => ({
  id: account.id,
  email: account.email,
  professionalId: account.professionalId,
  active: account.isActive,
  passwordSet: account.passwordHash !== UNSET_PASSWORD_HASH,
});
