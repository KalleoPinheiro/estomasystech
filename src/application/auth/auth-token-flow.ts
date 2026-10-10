import type { EmailGateway } from '@/application/ports/email-gateway';
import type { AuthTokenRepository } from '@/domain/auth/auth-token';
import {
  AuthToken,
  type AuthTokenPurpose,
  hashAuthTokenSecret,
} from '@/domain/auth/auth-token';
import type {
  UserAccount,
  UserAccountRepository,
} from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { ValidationError } from '@/domain/shared/errors';
import { hashPassword } from '@/lib/auth/password';
import { logError } from '@/lib/log-error';

/**
 * Mensagem única para link inexistente, expirado, já usado ou de conta inativa.
 * Distinguir os casos revelaria a quem tem o link se ele já foi usado por outra
 * pessoa, ou se um endereço corresponde a uma conta.
 */
export const INVALID_TOKEN_MESSAGE =
  'Link inválido ou expirado — solicite um novo';

export const MIN_PASSWORD_LENGTH = 8;

const SUBJECT_BY_PURPOSE: Record<AuthTokenPurpose, string> = {
  invite: 'VittaFlow — defina sua senha de acesso',
  reset: 'VittaFlow — redefinição de senha',
};

const INTRO_BY_PURPOSE: Record<AuthTokenPurpose, string> = {
  invite:
    'Sua conta no VittaFlow foi criada. Use o link abaixo para definir sua senha e acessar o sistema pela primeira vez.',
  reset:
    'Recebemos um pedido de redefinição de senha para sua conta no VittaFlow. Use o link abaixo para definir uma nova senha.',
};

const VALIDITY_BY_PURPOSE: Record<AuthTokenPurpose, string> = {
  invite: 'O link vale por 24 horas e só pode ser usado uma vez.',
  reset: 'O link vale por 1 hora e só pode ser usado uma vez.',
};

export interface IssueAuthTokenInput {
  account: UserAccount;
  purpose: AuthTokenPurpose;
  /** Base pública da aplicação (APP_URL) — compõe o link do e-mail. */
  appUrl: string;
  nowMs?: number;
}

/**
 * Emite um token de convite ou reset e envia o link por e-mail. Emitir invalida
 * os tokens anteriores não usados do mesmo propósito: pedir o link três vezes
 * não pode deixar três links vivos ao mesmo tempo.
 */
export class IssueAuthToken {
  constructor(
    private readonly tokens: AuthTokenRepository,
    private readonly email: EmailGateway,
  ) {}

  /**
   * Emite o token e tenta enviar, sem deixar a falha de envio perder o link:
   * devolve sempre o link gerado mais um sinal de se ele saiu por e-mail. Usado
   * onde não há segunda chance de emitir (bootstrap do primeiro Super Admin).
   */
  async issueAndTryDeliver(
    input: IssueAuthTokenInput,
  ): Promise<{ inviteUrl: string; delivered: boolean }> {
    const inviteUrl = await this.persist(input);
    try {
      await this.deliver(input, inviteUrl);
      return { inviteUrl, delivered: await this.email.isEnabled() };
    } catch (error) {
      // Só o id: o endereço é dado pessoal e log não é lugar para ele (CWE-532).
      logError(
        `Convite: falha ao enviar e-mail (conta ${input.account.id})`,
        error,
      );
      return { inviteUrl, delivered: false };
    }
  }

  /** Devolve o link gerado — o chamador decide se ele pode ser exposto. */
  async execute(input: IssueAuthTokenInput): Promise<string> {
    const inviteUrl = await this.persist(input);
    await this.deliver(input, inviteUrl);
    return inviteUrl;
  }

  /** Invalida os anteriores do mesmo propósito, persiste o novo e devolve o link. */
  private async persist(input: IssueAuthTokenInput): Promise<string> {
    const nowMs = input.nowMs ?? Date.now();
    const { token, secret } = AuthToken.issue({
      accountId: input.account.id,
      purpose: input.purpose,
      nowMs,
    });
    // Invalidar os irmãos e inserir o novo token numa única unidade atômica
    // (issue #50) — duas emissões concorrentes não deixam dois links válidos.
    await this.tokens.replaceUnused(token, new Date(nowMs));

    const base = input.appUrl.replace(/\/$/, '');
    return `${base}/definir-senha?token=${secret}`;
  }

  private async deliver(
    input: IssueAuthTokenInput,
    link: string,
  ): Promise<void> {
    await this.email.send({
      to: input.account.email,
      subject: SUBJECT_BY_PURPOSE[input.purpose],
      text: `${INTRO_BY_PURPOSE[input.purpose]}\n\n${link}\n\n${VALIDITY_BY_PURPOSE[input.purpose]}`,
    });
  }
}

export interface ConsumeAuthTokenInput {
  /** Segredo vindo do link (`?token=`) — nunca o hash. */
  secret: string;
  newPassword: string;
  /** Propósitos aceitos por este fluxo — token fora da lista é recusado. */
  expectedPurposes: AuthTokenPurpose[];
  nowMs?: number;
}

/**
 * Conta e propósito do token consumido — o chamador usa pra registrar a
 * trilha de auditoria (#71), que precisa saber quem teve a senha alterada e
 * se foi convite ou reset.
 */
export interface ConsumeAuthTokenResult {
  accountId: string;
  email: string;
  role: UserRole;
  clinicId: string | null;
  purpose: AuthTokenPurpose;
}

/** Consome um token de uso único e grava a nova senha da conta correspondente. */
export class ConsumeAuthToken {
  constructor(
    private readonly tokens: AuthTokenRepository,
    private readonly accounts: UserAccountRepository,
  ) {}

  async execute(input: ConsumeAuthTokenInput): Promise<ConsumeAuthTokenResult> {
    if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`,
      );
    }
    const nowMs = input.nowMs ?? Date.now();
    // Reivindica ANTES de qualquer outra coisa: o token é queimado no mesmo
    // comando que o valida, então duas requisições simultâneas com o mesmo link
    // não conseguem as duas trocar a senha (TOCTOU).
    const token = await this.tokens.claimBySecretHash(
      hashAuthTokenSecret(input.secret),
      nowMs,
    );
    if (!token) {
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }
    if (!input.expectedPurposes.includes(token.purpose)) {
      // Mensagem genérica: não revela que o token existe mas era de outro propósito.
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    const account = await this.accounts.findById(token.accountId);
    if (!account?.isActive) {
      // O token já foi queimado pela reivindicação. É o comportamento correto:
      // um link de conta desativada não deve continuar valendo.
      throw new ValidationError(INVALID_TOKEN_MESSAGE);
    }

    // Invalida os irmãos do mesmo propósito: consumir um link precisa queimar
    // todos os outros por conta própria, sem depender da invariante de que a
    // emissão já os invalidou.
    await this.tokens.markAllUnusedAsUsed(
      account.id,
      token.purpose,
      new Date(nowMs),
    );
    await this.accounts.updatePasswordHash(
      account.id,
      await hashPassword(input.newPassword),
    );

    return {
      accountId: account.id,
      email: account.email,
      role: account.role,
      clinicId: account.clinicId,
      purpose: token.purpose,
    };
  }
}
