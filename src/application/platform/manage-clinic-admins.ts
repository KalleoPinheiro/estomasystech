import { IssueAuthToken } from '@/application/auth/auth-token-flow';
import { CreateAccount } from '@/application/auth/create-account';
import {
  appUrlFromEnv,
  type InviteServices,
  sendInvite,
} from '@/application/auth/send-invite';
import { assertCanDeactivate } from '@/domain/auth/account-management';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import type { Clinic } from '@/domain/clinic/clinic';
import { ValidationError } from '@/domain/shared/errors';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { isUniqueViolation } from '@/lib/db-errors';
import { PLATFORM_ACCOUNT_MANAGER, PLATFORM_ACTOR } from './platform-actor';

export const ADMIN_ACTIONS = [
  'resend-invite',
  'deactivate',
  'reactivate',
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const INCOMPLETE_REGISTRATION_MESSAGE =
  'Complete o cadastro da clínica (nome, CNPJ, telefone e e-mail de contato) antes de convidar o admin';
const DUPLICATE_EMAIL_MESSAGE = 'Já existe conta com este email';

export interface ManageClinicAdminsServices extends InviteServices {
  /** Escopado à clínica-alvo (`clinicScope`). */
  userAccounts: UserAccountRepository;
}

export interface AdminActionResult {
  account: UserAccount;
  /** Só no reenvio; `null` nas ações sem e-mail. */
  delivered: boolean | null;
}

/**
 * Gestão dos `company_admin` de uma clínica pela plataforma (B4, #214; Journey
 * 4 e 5): listar, convidar, reenviar convite, desativar e reativar. Só conta
 * `company_admin` é alvo — o resto da equipe e o portal são da clínica.
 */
export class ManageClinicAdmins {
  constructor(private readonly services: ManageClinicAdminsServices) {}

  list(): Promise<UserAccount[]> {
    return this.services.userAccounts.findByRole('company_admin');
  }

  /** Conta `company_admin` desta clínica, ou `null`. */
  async find(accountId: string): Promise<UserAccount | null> {
    const account = await this.services.userAccounts.findById(accountId);
    return account?.role === 'company_admin' ? account : null;
  }

  /**
   * Convite de um admin (primeiro ou substituto). Clínica sem cadastro
   * completo não recebe admin (design, "Clínica do go-live").
   */
  async invite(
    clinic: Clinic,
    email: string,
  ): Promise<{ account: UserAccount; delivered: boolean }> {
    if (!clinic.isRegistrationComplete()) {
      throw new ValidationError(INCOMPLETE_REGISTRATION_MESSAGE);
    }
    const account = await new CreateAccount(this.services.userAccounts)
      .execute(PLATFORM_ACTOR, {
        email,
        passwordHash: UNSET_PASSWORD_HASH,
        role: 'company_admin',
        clinicId: clinic.id,
      })
      .catch((error: unknown) => {
        // Corrida: dois convites do mesmo e-mail passam pela checagem prévia;
        // `uq_user_accounts_clinic_email` deixa só um gravar.
        throw isUniqueViolation(error)
          ? new ValidationError(DUPLICATE_EMAIL_MESSAGE)
          : error;
      });
    const { delivered } = await sendInvite(this.services, account);
    return { account, delivered };
  }

  /**
   * `audit` roda antes da alteração (write-ahead, #184): se a trilha falha,
   * nada muda.
   */
  async apply(
    account: UserAccount,
    action: AdminAction,
    audit: () => Promise<void>,
  ): Promise<AdminActionResult> {
    if (action === 'resend-invite') {
      return this.resendInvite(account, audit);
    }
    if (action === 'deactivate') {
      assertCanDeactivate(
        PLATFORM_ACCOUNT_MANAGER,
        account,
        await this.services.userAccounts.findByRole('company_admin'),
      );
    }
    await audit();
    const updated =
      action === 'deactivate' ? account.deactivate() : account.reactivate();
    await this.services.userAccounts.save(updated);
    if (action === 'deactivate') {
      // Conta desativada derruba as sessões existentes (#194).
      await this.services.userAccounts.revokeSessions(updated.id);
    }
    return { account: updated, delivered: null };
  }

  /** Mesma regra de `POST /api/accounts/[id]/resend-invite` (#52). */
  private async resendInvite(
    account: UserAccount,
    audit: () => Promise<void>,
  ): Promise<AdminActionResult> {
    if (!account.isActive) {
      throw new ValidationError('Conta desativada não pode receber convite');
    }
    await audit();
    const { delivered } = await new IssueAuthToken(
      this.services.authTokens,
      this.services.email,
    ).issueAndTryDeliver({
      account,
      purpose:
        account.passwordHash === UNSET_PASSWORD_HASH ? 'invite' : 'reset',
      appUrl: appUrlFromEnv(),
    });
    return { account, delivered };
  }
}
