import { createHash, randomBytes } from 'node:crypto';
import { newId } from '../shared/id';

/** Convite: primeiro acesso da conta. Reset: recuperação self-service. */
export type AuthTokenPurpose = 'invite' | 'reset';

/** Convite sobrevive a um e-mail lido no dia seguinte. */
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
/** Reset é ação imediata e deliberada — janela menor. */
export const RESET_TTL_MS = 60 * 60 * 1000;

const SECRET_BYTES = 32;

const TTL_BY_PURPOSE: Record<AuthTokenPurpose, number> = {
  invite: INVITE_TTL_MS,
  reset: RESET_TTL_MS,
};

/**
 * O segredo circula só no link do e-mail; o banco guarda o hash. Um vazamento
 * de leitura da tabela não vira tomada de conta.
 */
export function hashAuthTokenSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export interface AuthTokenState {
  id: string;
  accountId: string;
  purpose: AuthTokenPurpose;
  secretHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IssueAuthTokenProps {
  accountId: string;
  purpose: AuthTokenPurpose;
  nowMs?: number;
}

/** Token opaco de ativação/reset: expiração curta e uso único. */
export class AuthToken {
  private constructor(private readonly state: AuthTokenState) {}

  static issue(props: IssueAuthTokenProps): {
    token: AuthToken;
    secret: string;
  } {
    const nowMs = props.nowMs ?? Date.now();
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const token = new AuthToken({
      id: newId(),
      accountId: props.accountId,
      purpose: props.purpose,
      secretHash: hashAuthTokenSecret(secret),
      expiresAt: new Date(nowMs + TTL_BY_PURPOSE[props.purpose]),
      usedAt: null,
      createdAt: new Date(nowMs),
    });
    return { token, secret };
  }

  static restore(state: AuthTokenState): AuthToken {
    return new AuthToken({ ...state });
  }

  /** Usável = ainda não consumido E dentro da validade. */
  isUsable(nowMs: number = Date.now()): boolean {
    return this.state.usedAt === null && this.state.expiresAt.getTime() > nowMs;
  }

  markUsed(usedAt: Date = new Date()): AuthToken {
    return new AuthToken({ ...this.state, usedAt });
  }

  get id(): string {
    return this.state.id;
  }

  get accountId(): string {
    return this.state.accountId;
  }

  get purpose(): AuthTokenPurpose {
    return this.state.purpose;
  }

  get secretHash(): string {
    return this.state.secretHash;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  get usedAt(): Date | null {
    return this.state.usedAt;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}

export interface AuthTokenRepository {
  save(token: AuthToken): Promise<void>;
  /**
   * Reivindica o token de forma ATÔMICA: marca como usado e devolve-o apenas
   * se, no mesmo comando, ele ainda estava não usado e dentro da validade.
   * Devolve `null` quando expirado, já usado ou inexistente.
   *
   * Existe separado de uma busca seguida de escrita porque "checar e depois
   * marcar" é uma janela TOCTOU: duas requisições simultâneas com o mesmo link
   * passariam as duas pela checagem e o uso único deixaria de valer.
   */
  claimBySecretHash(
    secretHash: string,
    nowMs?: number,
  ): Promise<AuthToken | null>;
  /**
   * Leitura sem efeito: o token ainda não usado e dentro da validade, ou
   * `null`. Serve só para conferir a senha nova contra a política do papel da
   * conta antes de queimar o link (#291) — o uso único continua sendo do
   * `claimBySecretHash`.
   */
  findUsableBySecretHash(
    secretHash: string,
    nowMs?: number,
  ): Promise<AuthToken | null>;
  /** Invalida os tokens não usados de um propósito — emitir um novo mata os anteriores. */
  markAllUnusedAsUsed(
    accountId: string,
    purpose: AuthTokenPurpose,
    usedAt?: Date,
  ): Promise<void>;
  /**
   * Invalida os tokens não usados do mesmo propósito e persiste `token` numa
   * única unidade atômica — emissões concorrentes não podem deixar dois links
   * válidos vivos ao mesmo tempo para a mesma conta+propósito.
   */
  replaceUnused(token: AuthToken, usedAt?: Date): Promise<void>;
}
