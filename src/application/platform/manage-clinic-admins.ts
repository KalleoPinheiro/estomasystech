import { CreateAccount } from '@/application/auth/create-account';
import {
  type AccessLinkResult,
  type InviteServices,
  issueAccessLink,
  sendInvite,
} from '@/application/auth/send-invite';
import type { TransactionManager } from '@/application/ports/transaction-manager';
import type { AuditEventRepository } from '@/domain/audit/audit-event-repository';
import {
  assertCanDeactivate,
  DEACTIVATED_ACCOUNT_MESSAGE,
} from '@/domain/auth/account-management';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import type { Clinic } from '@/domain/clinic/clinic';
import { ConflictError, ValidationError } from '@/domain/shared/errors';
import { UNSET_PASSWORD_HASH } from '@/lib/auth/password';
import { isUniqueViolation } from '@/lib/db-errors';
import { PLATFORM_ACCOUNT_MANAGER, PLATFORM_ACTOR } from './platform-actor';

export const ADMIN_ACTIONS = [
  'resend-invite',
  'deactivate',
  'reactivate',
  'reset-link',
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const INCOMPLETE_REGISTRATION_MESSAGE =
  'Complete o cadastro da clínica (nome, CNPJ, telefone e e-mail de contato) antes de convidar o admin';
export const SUSPENDED_CLINIC_INVITE_MESSAGE =
  'Clínica suspensa: reative a clínica antes de convidar o admin';
const DUPLICATE_EMAIL_MESSAGE = 'Já existe conta com este email';

export interface ManageClinicAdminsServices extends InviteServices {
  /** Escopado à clínica-alvo (`clinicScope`). */
  userAccounts: UserAccountRepository;
  /** Escopado à clínica-alvo — usado pelo `audit` de `apply` fora de transação. */
  auditEvents: AuditEventRepository;
  /**
   * Unidade de trabalho escopada à clínica-alvo (#243): o convite grava a
   * conta nova e o evento de auditoria na mesma transação — falha na
   * auditoria desfaz a conta.
   */
  transactions: TransactionManager;
}

/**
 * Grava o evento de auditoria do convite (#243): roda dentro da mesma
 * transação que cria a conta, contra o repositório escopado ao `tx`. Falha
 * aqui desfaz a conta junto (rollback).
 */
export type RecordAdminInviteAudit = (
  auditEvents: AuditEventRepository,
  account: UserAccount,
) => Promise<void>;

/**
 * Grava o evento de auditoria de `apply` (reenvio, desativar, reativar)
 * contra o repositório correto: fora de transação, o da clínica; em
 * `deactivate` (#244), o escopado ao `tx` — chamar o repositório de fora da
 * transação enquanto ela está aberta trava o PGlite (conexão única, fila
 * exclusiva por operação).
 */
export type RecordAdminActionAudit = (
  auditEvents: AuditEventRepository,
) => Promise<void>;

export interface AdminActionResult {
  account: UserAccount;
  /** Só no reenvio e na redefinição; `null` nas ações sem e-mail. */
  delivered: boolean | null;
  /** O link, só quando ele não saiu por e-mail (C2, #265). */
  inviteUrl: string | null;
}

/**
 * Clínica suspensa (B5) não recebe convite nem reenvio: o convidado definiria
 * a senha e toparia com o login negado. Desativar/reativar admin seguem.
 */
function assertNotSuspended(clinic: Clinic): void {
  if (clinic.isSuspended) {
    throw new ValidationError(SUSPENDED_CLINIC_INVITE_MESSAGE);
  }
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
   * completo não recebe admin (design, "Clínica do go-live"). A conta e o
   * evento de auditoria gravam na mesma transação (#243): falha na
   * auditoria desfaz a conta.
   */
  async invite(
    clinic: Clinic,
    email: string,
    recordAudit: RecordAdminInviteAudit,
  ): Promise<{ account: UserAccount } & AccessLinkResult> {
    assertNotSuspended(clinic);
    if (!clinic.isRegistrationComplete()) {
      throw new ValidationError(INCOMPLETE_REGISTRATION_MESSAGE);
    }
    const account = await this.services.transactions.run(
      async ({ userAccounts, auditEvents }) => {
        const created = await new CreateAccount(userAccounts)
          .execute(PLATFORM_ACTOR, {
            email,
            passwordHash: UNSET_PASSWORD_HASH,
            role: 'company_admin',
            clinicId: clinic.id,
          })
          .catch((error: unknown) => {
            // Corrida: dois convites do mesmo e-mail passam pela checagem
            // prévia; `uq_user_accounts_clinic_email` deixa só um gravar.
            throw isUniqueViolation(error)
              ? new ValidationError(DUPLICATE_EMAIL_MESSAGE)
              : error;
          });
        await recordAudit(auditEvents, created);
        return created;
      },
    );
    return { account, ...(await sendInvite(this.services, account)) };
  }

  /**
   * `audit` roda antes da alteração (write-ahead, #184): se a trilha falha,
   * nada muda.
   */
  async apply(
    clinic: Clinic,
    account: UserAccount,
    action: AdminAction,
    audit: RecordAdminActionAudit,
  ): Promise<AdminActionResult> {
    if (action === 'resend-invite') {
      assertNotSuspended(clinic);
      return this.resendInvite(account, audit);
    }
    if (action === 'reset-link') {
      assertNotSuspended(clinic);
      return this.resetLink(account, audit);
    }
    if (action === 'deactivate') {
      return this.deactivate(account, audit);
    }
    await audit(this.services.auditEvents);
    const updated = account.reactivate();
    await this.services.userAccounts.save(updated);
    return { account: updated, delivered: null, inviteUrl: null };
  }

  /**
   * Desativar é a única ação sujeita à regra do último admin ativo, e a
   * checagem lê outras contas antes de gravar (#244): duas desativações
   * concorrentes de admins diferentes da mesma clínica liam o mesmo estado e
   * as duas passavam. `findByRoleForUpdate` tranca (`SELECT ... FOR UPDATE`)
   * as linhas `company_admin` dentro da transação, então a segunda
   * desativação espera a primeira confirmar e reavalia a regra já com o
   * estado atualizado — nunca as duas passam.
   */
  private async deactivate(
    account: UserAccount,
    audit: RecordAdminActionAudit,
  ): Promise<AdminActionResult> {
    return this.services.transactions.run(
      async ({ userAccounts, auditEvents }) => {
        const clinicAdmins =
          await userAccounts.findByRoleForUpdate('company_admin');
        assertCanDeactivate(PLATFORM_ACCOUNT_MANAGER, account, clinicAdmins);
        // Auditoria escopada ao `tx` (#244): usar o repositório de fora da
        // transação aqui trava o PGlite (mutex exclusivo, conexão única).
        await audit(auditEvents);
        const updated = account.deactivate();
        await userAccounts.save(updated);
        // Conta desativada derruba as sessões existentes (#194).
        await userAccounts.revokeSessions(updated.id);
        return { account: updated, delivered: null, inviteUrl: null };
      },
    );
  }

  /** Mesma regra de `POST /api/accounts/[id]/resend-invite` (#52). */
  private async resendInvite(
    account: UserAccount,
    audit: RecordAdminActionAudit,
  ): Promise<AdminActionResult> {
    if (!account.isActive) {
      throw new ValidationError('Conta desativada não pode receber convite');
    }
    await audit(this.services.auditEvents);
    const purpose =
      account.passwordHash === UNSET_PASSWORD_HASH ? 'invite' : 'reset';
    return {
      account,
      ...(await issueAccessLink(this.services, account, purpose)),
    };
  }

  /**
   * Mesma regra de `POST /api/accounts/[id]/reset-link` (C2, #265): token
   * `reset` de 1 h, que invalida os anteriores não usados.
   */
  private async resetLink(
    account: UserAccount,
    audit: RecordAdminActionAudit,
  ): Promise<AdminActionResult> {
    if (!account.isActive) {
      throw new ConflictError(DEACTIVATED_ACCOUNT_MESSAGE);
    }
    await audit(this.services.auditEvents);
    return {
      account,
      ...(await issueAccessLink(this.services, account, 'reset')),
    };
  }
}
