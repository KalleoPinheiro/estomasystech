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
  /** Cadastro de paciente dono da conta de portal (#196) — só no papel `patient`. */
  patientId?: string | null;
  /** Cadastro de parceiro dono da conta de portal (#196) — só no papel `partner`. */
  partnerId?: string | null;
}

export interface UserAccountState extends UserAccountProps {
  id: string;
  active: boolean;
  createdAt: Date;
  /**
   * Versão das sessões da conta (#194, ADR-005). Token com `sv` diferente é
   * revogado. Só o repositório incrementa (`revokeSessions`, atômico).
   */
  sessionVersion?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail de login na forma gravada (trim + minúsculas); inválido lança. */
export function normalizeAccountEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError('Email inválido');
  }
  return email;
}

/** Conta individual de acesso da equipe — identidade real na auditoria. */
export class UserAccount {
  private constructor(private readonly state: UserAccountState) {}

  static create(props: UserAccountProps): UserAccount {
    const email = normalizeAccountEmail(props.email);
    if (!props.passwordHash.startsWith('scrypt$')) {
      throw new ValidationError('Hash de senha em formato inválido');
    }
    return new UserAccount({
      email,
      passwordHash: props.passwordHash,
      role: props.role,
      clinicId: props.clinicId,
      professionalId: props.professionalId ?? null,
      patientId: props.patientId ?? null,
      partnerId: props.partnerId ?? null,
      id: newId(),
      active: true,
      createdAt: new Date(),
      sessionVersion: 0,
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

  get patientId(): string | null {
    return this.state.patientId ?? null;
  }

  get partnerId(): string | null {
    return this.state.partnerId ?? null;
  }

  get sessionVersion(): number {
    return this.state.sessionVersion ?? 0;
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
  /** Contas de um papel, na ordem do e-mail — sem o teto de `findAll` (B4). */
  findByRole(role: UserRole): Promise<UserAccount[]>;
  /**
   * Como `findByRole`, mas tranca as linhas (`SELECT ... FOR UPDATE`) dentro
   * da transação corrente (#244): duas desativações concorrentes de
   * `company_admin` da mesma empresa leem o mesmo estado sem o lock — a
   * segunda só reavalia a regra do último admin depois que a primeira
   * confirma. Fora de uma transação real (in-memory), delega para
   * `findByRole` sem lock.
   */
  findByRoleForUpdate(role: UserRole): Promise<UserAccount[]>;
  /**
   * Troca só o hash de senha, identificando a conta pelo id. Existe separado de
   * `save` porque o fluxo de convite/reset roda ANTES de haver sessão: não há
   * empresa de contexto para escopar o repositório, e a autorização vem do
   * token de uso único, não do tenant.
   */
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  /**
   * Invalida todas as sessões emitidas para a conta (#194, ADR-005):
   * incrementa `session_version` numa única instrução — `save` nunca grava
   * esse campo, então dois incrementos concorrentes nunca se anulam.
   * `updatePasswordHash` já incrementa por conta própria.
   */
  revokeSessions(id: string): Promise<void>;
  /**
   * Invalida as sessões de TODAS as contas da empresa do escopo (suspensão da
   * clínica, B5): `session_version + 1` numa única instrução. Exige repositório
   * escopado a uma clínica.
   */
  revokeAllSessions(): Promise<void>;
  /** Conta de portal já vinculada a este cadastro (#196), se houver. */
  findByPortalLink(
    link: { patientId: string } | { partnerId: string },
  ): Promise<UserAccount | null>;
  /** Existe ao menos uma conta na instalação? Guarda do bootstrap do primeiro Super Admin. */
  hasAnyAccount(): Promise<boolean>;
}
