import {
  ConflictError,
  ProvisioningDeniedError,
  ValidationError,
} from '../shared/errors';
import { canProvision } from './role-hierarchy';
import type { UserAccount } from './user-account';
import type { UserRole } from './user-role';

/**
 * Quem está gerindo a conta. `subject` é o e-mail gravado na sessão pelo login
 * (`null` no modo aberto de dev, que não tem conta própria).
 */
export interface AccountManager {
  role: UserRole;
  subject: string | null;
}

/**
 * Gerir uma conta existente (senha, ativação, reenvio de convite) segue a mesma
 * matriz de quem pode cadastrar quem (#184, ADR-003). O escopo de empresa fica
 * com a rota: conta de outra empresa nem é encontrada (404).
 */
export function assertCanManageAccount(
  actor: AccountManager,
  target: UserAccount,
): void {
  if (!canProvision(actor.role, target.role)) {
    throw new ProvisioningDeniedError(
      `Papel "${actor.role}" não pode alterar contas com papel "${target.role}"`,
    );
  }
}

export const LAST_ADMIN_MESSAGE =
  'Não é possível desativar o último administrador ativo da empresa';

/**
 * Bloqueia desativar a própria conta (`400`) e o último `company_admin` ativo
 * da empresa (`409`, #295) — qualquer um dos dois trancaria a empresa fora do
 * sistema. `clinicAccounts` são as contas da empresa do alvo.
 */
export function assertCanDeactivate(
  actor: AccountManager,
  target: UserAccount,
  clinicAccounts: readonly UserAccount[],
): void {
  if (actor.subject !== null && target.email === actor.subject) {
    throw new ValidationError('Não é possível desativar a própria conta');
  }
  if (target.role !== 'company_admin' || !target.isActive) return;
  const otherActiveAdmins = clinicAccounts.filter(
    (account) =>
      account.id !== target.id &&
      account.role === 'company_admin' &&
      account.isActive,
  );
  if (otherActiveAdmins.length === 0) {
    throw new ConflictError(LAST_ADMIN_MESSAGE);
  }
}

/** Recusa de link de redefinição para conta desativada (C2, #265). */
export const DEACTIVATED_ACCOUNT_MESSAGE = 'Conta desativada';

/** Contas que o papel enxerga na listagem: só as que ele pode gerir. */
export function visibleAccounts(
  role: UserRole,
  accounts: readonly UserAccount[],
): UserAccount[] {
  return accounts.filter((account) => canProvision(role, account.role));
}

/** Resumo da alteração para o `detail` da auditoria; `null` se nada muda. */
export function accountChangeDetail(change: {
  active?: boolean;
}): string | null {
  if (change.active === false) return 'deactivate';
  if (change.active === true) return 'reactivate';
  return null;
}
