import { DEACTIVATED_ACCOUNT_MESSAGE } from '@/domain/auth/account-management';
import type { MfaRepository } from '@/domain/auth/mfa';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import { ConflictError } from '@/domain/shared/errors';

export const NO_MFA_FACTOR_MESSAGE =
  'Esta conta não tem segundo fator cadastrado';

export interface ResetAccountMfaDeps {
  userAccounts: UserAccountRepository;
  mfa: MfaRepository;
}

/**
 * Reset do segundo fator de outra conta por quem a gere (#295): remove o fator
 * e os códigos de recuperação e derruba as sessões. Quem precisa do fator
 * (`company_admin`) cadastra um novo no próximo login (ACE-RN-42); quem o tem
 * opcional volta a entrar só com a senha e liga de novo em "Minha conta".
 *
 * `audit` roda antes de qualquer mudança (write-ahead, #184). As sessões caem
 * antes de o fator sair: se a remoção falhar, a chamada pode ser repetida.
 */
export async function resetAccountMfa(
  deps: ResetAccountMfaDeps,
  account: UserAccount,
  audit: () => Promise<void>,
): Promise<void> {
  if (!account.isActive) {
    throw new ConflictError(DEACTIVATED_ACCOUNT_MESSAGE);
  }
  if (!(await deps.mfa.findFactor(account.id))) {
    throw new ConflictError(NO_MFA_FACTOR_MESSAGE);
  }
  await audit();
  await deps.userAccounts.revokeSessions(account.id);
  await deps.mfa.removeFactor(account.id);
}
