import { canProvision } from '@/domain/auth/role-hierarchy';
import {
  UserAccount,
  type UserAccountRepository,
} from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import {
  ProvisioningDeniedError,
  ValidationError,
} from '@/domain/shared/errors';

export interface CreateAccountActor {
  role: UserRole;
  /** `null` só para super_admin (cross-empresa). */
  clinicId: string | null;
}

export interface CreateAccountInput {
  email: string;
  /** Hash já calculado (`scrypt$...`) — o use-case nunca lida com senha em claro. */
  passwordHash: string;
  role: UserRole;
  /** Empresa-alvo da nova conta. Obrigatório mesmo para super_admin (ele escolhe a empresa). */
  clinicId: string;
  professionalId?: string | null;
  /** Cadastro de paciente dono da conta — obrigatório no papel `patient` (#196). */
  patientId?: string | null;
  /** Cadastro de parceiro dono da conta — obrigatório no papel `partner` (#196). */
  partnerId?: string | null;
  /** Cadastro de responsável dono da conta — obrigatório no papel `guardian` (ADR-027). */
  guardianId?: string | null;
}

/**
 * Cadastro de conta respeitando a hierarquia de provisionamento (RBAC-07..14,
 * ADR-003): valida quem pode criar quem, e que o alvo pertence à própria
 * empresa do ator — exceto super_admin, que pode escolher qualquer empresa.
 */
export class CreateAccount {
  constructor(private readonly accounts: UserAccountRepository) {}

  async execute(
    actor: CreateAccountActor,
    input: CreateAccountInput,
  ): Promise<UserAccount> {
    if (!canProvision(actor.role, input.role)) {
      throw new ProvisioningDeniedError(
        `Papel "${actor.role}" não pode cadastrar contas com papel "${input.role}"`,
      );
    }
    if (actor.role !== 'super_admin' && input.clinicId !== actor.clinicId) {
      throw new ProvisioningDeniedError(
        'Não é possível cadastrar conta em uma empresa diferente da própria',
      );
    }
    if (input.role === 'profissional' && !input.professionalId) {
      // Sem professionalId, a sessão nasce com vínculo nulo e o escopo
      // dinâmico (R4, professional-patient-scope.ts) nega acesso a todo
      // paciente — conta inutilizável por construção.
      throw new ValidationError(
        'professionalId é obrigatório para o papel profissional',
      );
    }

    await this.assertPortalLink(input);

    const existing = await this.accounts.findByEmail(input.email);
    if (existing) {
      throw new ValidationError('Já existe conta com este email');
    }

    const account = UserAccount.create({
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      clinicId: input.clinicId,
      professionalId: input.professionalId ?? null,
      patientId: input.role === 'patient' ? input.patientId : null,
      partnerId: input.role === 'partner' ? input.partnerId : null,
      guardianId: input.role === 'guardian' ? input.guardianId : null,
    });
    await this.accounts.save(account);
    return account;
  }

  /**
   * Conta de portal nasce vinculada ao cadastro (#196): o portal resolve o
   * titular por esse vínculo, nunca pelo e-mail. Um acesso por cadastro. A
   * existência do cadastro na empresa é validada pela rota, que tem os
   * repositórios de paciente e parceiro.
   */
  private async assertPortalLink(input: CreateAccountInput): Promise<void> {
    if (input.role === 'patient') {
      if (!input.patientId) {
        throw new ValidationError(
          'patientId é obrigatório para o papel paciente',
        );
      }
      if (
        await this.accounts.findByPortalLink({ patientId: input.patientId })
      ) {
        throw new ValidationError('Este paciente já tem acesso ao portal');
      }
    }
    if (input.role === 'partner') {
      if (!input.partnerId) {
        throw new ValidationError(
          'partnerId é obrigatório para o papel parceiro',
        );
      }
      if (
        await this.accounts.findByPortalLink({ partnerId: input.partnerId })
      ) {
        throw new ValidationError('Este parceiro já tem acesso ao portal');
      }
    }
    if (input.role === 'guardian') {
      if (!input.guardianId) {
        throw new ValidationError(
          'guardianId é obrigatório para o papel responsável',
        );
      }
      if (
        await this.accounts.findByPortalLink({ guardianId: input.guardianId })
      ) {
        throw new ValidationError('Este responsável já tem acesso ao portal');
      }
    }
  }
}
