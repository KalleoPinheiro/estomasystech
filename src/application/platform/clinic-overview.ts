import type { UserAccount } from '@/domain/auth/user-account';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';

/**
 * Estado do admin de uma clínica na lista da plataforma (B4, Journey 4):
 * `active` se algum `company_admin` ativo já definiu senha; `pending`
 * ("aguardando primeiro acesso") se há `company_admin` ativo só com convite;
 * `none` se não há `company_admin` ativo.
 */
export type AdminStatus = 'none' | 'pending' | 'active';

export function adminStatusOf(
  companyAdmins: readonly UserAccount[],
): AdminStatus {
  const active = companyAdmins.filter(
    (account) => account.role === 'company_admin' && account.isActive,
  );
  if (active.some((account) => account.passwordHash !== UNSET_PASSWORD_HASH)) {
    return 'active';
  }
  return active.length > 0 ? 'pending' : 'none';
}
