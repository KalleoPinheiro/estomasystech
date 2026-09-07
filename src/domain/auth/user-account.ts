import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import type { UserRole } from './user-role';

export interface UserAccountProps {
  email: string;
  /** Hash de senha no formato `scrypt$N$salt$hash` (nunca a senha em claro). */
  passwordHash: string;
  /** Papel de acesso — um dos 6 valores do catálogo (RBAC-01). */
  role: UserRole;
  /** Empresa da conta — nulo somente para super_admin (cross-empresa). */
  clinicId: string | null;
  /** Profissional vinculado — autoria automática de evoluções. */
  professionalId?: string | null;
}

export interface UserAccountState extends UserAccountProps {
  id: string;
  active: boolean;
  createdAt: Date;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Conta individual de acesso da equipe — identidade real na auditoria. */
export class UserAccount {
  private constructor(private readonly state: UserAccountState) {}

  static create(props: UserAccountProps): UserAccount {
    const email = props.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new ValidationError('Email inválido');
    }
    if (!props.passwordHash.startsWith('scrypt$')) {
      throw new ValidationError('Hash de senha em formato inválido');
    }
    return new UserAccount({
      email,
      passwordHash: props.passwordHash,
      role: props.role,
      clinicId: props.clinicId,
      professionalId: props.professionalId ?? null,
      id: newId(),
      active: true,
      createdAt: new Date(),
    });
  }

  static restore(state: UserAccountState): UserAccount {
    return new UserAccount({ ...state });
  }

  withPasswordHash(passwordHash: string): UserAccount {
    if (!passwordHash.startsWith('scrypt$')) {
      throw new ValidationError('Hash de senha em formato inválido');
    }
    return new UserAccount({ ...this.state, passwordHash });
  }

  deactivate(): UserAccount {
    return new UserAccount({ ...this.state, active: false });
  }

  reactivate(): UserAccount {
    return new UserAccount({ ...this.state, active: true });
  }

  get id(): string {
    return this.state.id;
  }

  get email(): string {
    return this.state.email;
  }

  get passwordHash(): string {
    return this.state.passwordHash;
  }

  get professionalId(): string | null {
    return this.state.professionalId ?? null;
  }

  get role(): UserRole {
    return this.state.role;
  }

  get clinicId(): string | null {
    return this.state.clinicId;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}

export interface UserAccountRepository {
  save(account: UserAccount): Promise<void>;
  findByEmail(email: string): Promise<UserAccount | null>;
  /**
   * Todas as contas com este e-mail, em qualquer clínica (issue #125). MT-06
   * permite o mesmo e-mail em empresas diferentes — só o login (que roda sem
   * clínica de contexto) precisa enxergar todas as candidatas de uma vez para
   * desambiguar por senha, em vez de pegar uma linha arbitrária.
   */
  findAllByEmail(email: string): Promise<UserAccount[]>;
  findById(id: string): Promise<UserAccount | null>;
  findAll(): Promise<UserAccount[]>;
  /**
   * Troca só o hash de senha, identificando a conta pelo id. Existe separado de
   * `save` porque o fluxo de convite/reset roda ANTES de haver sessão: não há
   * empresa de contexto para escopar o repositório, e a autorização vem do
   * token de uso único, não do tenant.
   */
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  /** Existe ao menos uma conta na instalação? Guarda do bootstrap do primeiro Super Admin. */
  hasAnyAccount(): Promise<boolean>;
}
