import { assertPasswordPolicy } from '@/domain/auth/password-policy';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import { ValidationError } from '@/domain/shared/errors';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

export const WRONG_CURRENT_PASSWORD_MESSAGE = 'Senha atual incorreta';
export const SAME_PASSWORD_MESSAGE =
  'A nova senha precisa ser diferente da atual';

/** A pessoa prova que é ela: a sessão aberta sozinha não autoriza trocar a senha. */
export async function assertCurrentPassword(
  account: UserAccount,
  currentPassword: string,
): Promise<void> {
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    throw new ValidationError(WRONG_CURRENT_PASSWORD_MESSAGE);
  }
}

/**
 * Troca da própria senha (#295): confere a atual, aplica a política (ACE-RN-41)
 * e grava depois de `audit` (write-ahead, #184). `updatePasswordHash`
 * incrementa a `session_version` e, com ela, derruba todas as sessões; devolve
 * a versão nova para a rota renovar só o cookie de quem trocou.
 */
export async function changeOwnPassword(
  userAccounts: UserAccountRepository,
  account: UserAccount,
  input: { currentPassword: string; newPassword: string },
  audit: () => Promise<void>,
): Promise<number> {
  await assertCurrentPassword(account, input.currentPassword);
  assertPasswordPolicy(input.newPassword);
  if (input.newPassword === input.currentPassword) {
    throw new ValidationError(SAME_PASSWORD_MESSAGE);
  }
  const passwordHash = await hashPassword(input.newPassword);
  await audit();
  await userAccounts.updatePasswordHash(account.id, passwordHash);
  const updated = await userAccounts.findById(account.id);
  return updated?.sessionVersion ?? account.sessionVersion + 1;
}
