import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConsumeAuthToken,
  INVALID_TOKEN_MESSAGE,
  IssueAuthToken,
} from '@/application/auth/auth-token-flow';
import {
  type EmailGateway,
  type EmailMessage,
  NullEmailGateway,
} from '@/application/ports/email-gateway';
import type { AuthTokenRepository } from '@/domain/auth/auth-token';
import {
  AuthToken,
  type AuthTokenPurpose,
  hashAuthTokenSecret,
} from '@/domain/auth/auth-token';
import { COMMON_PASSWORD_MESSAGE } from '@/domain/auth/password-policy';
import { UserAccount } from '@/domain/auth/user-account';
import { InMemoryUserAccountRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { verifyPassword } from '@/lib/auth/password';

const NOW = new Date('2026-09-01T12:00:00.000Z').getTime();
const APP_URL = 'https://app.vitta.test';

class InMemoryAuthTokenRepository implements AuthTokenRepository {
  readonly items = new Map<string, AuthToken>();

  async save(token: AuthToken): Promise<void> {
    this.items.set(token.id, token);
  }

  /** Espelha a semântica atômica do repositório real: valida e queima de uma vez. */
  async claimBySecretHash(
    secretHash: string,
    nowMs: number = Date.now(),
  ): Promise<AuthToken | null> {
    const found = [...this.items.values()].find(
      (token) => token.secretHash === secretHash && token.isUsable(nowMs),
    );
    if (!found) {
      return null;
    }
    const claimed = found.markUsed(new Date(nowMs));
    this.items.set(claimed.id, claimed);
    return claimed;
  }

  /** Leitura sem queimar: espelha o repositório real. */
  async findUsableBySecretHash(
    secretHash: string,
    nowMs: number = Date.now(),
  ): Promise<AuthToken | null> {
    return (
      [...this.items.values()].find(
        (token) => token.secretHash === secretHash && token.isUsable(nowMs),
      ) ?? null
    );
  }

  async markAllUnusedAsUsed(
    accountId: string,
    purpose: AuthTokenPurpose,
    usedAt: Date = new Date(),
  ): Promise<void> {
    for (const [id, token] of this.items) {
      if (
        token.accountId === accountId &&
        token.purpose === purpose &&
        token.usedAt === null
      ) {
        this.items.set(id, token.markUsed(usedAt));
      }
    }
  }

  /** Espelha a semântica atômica do repositório real (issue #50). */
  async replaceUnused(
    token: AuthToken,
    usedAt: Date = new Date(),
  ): Promise<void> {
    await this.markAllUnusedAsUsed(token.accountId, token.purpose, usedAt);
    await this.save(token);
  }
}

class SpyEmailGateway implements EmailGateway {
  async isEnabled(): Promise<boolean> {
    return true;
  }
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

const linkToken = (text: string): string => {
  const match = text.match(/definir-senha\?token=([\w-]+)/);
  if (!match) {
    throw new Error(`Nenhum link de token no corpo do e-mail: ${text}`);
  }
  return match[1];
};

describe('Feature: Emissão e consumo de token de convite/reset', () => {
  let tokens: InMemoryAuthTokenRepository;
  let accounts: InMemoryUserAccountRepository;
  let email: SpyEmailGateway;
  let account: UserAccount;

  beforeEach(async () => {
    tokens = new InMemoryAuthTokenRepository();
    accounts = new InMemoryUserAccountRepository();
    email = new SpyEmailGateway();
    account = UserAccount.create({
      email: 'pessoa@clinica.com',
      passwordHash: 'scrypt$0$sem-senha$sem-senha',
      role: 'atendente',
      clinicId: 'clinic-a',
    });
    await accounts.save(account);
  });

  describe('Cenário: emitir convite (AUTH-04)', () => {
    it('Dado uma conta, Quando emitir convite, Então envia e-mail com o link de definição de senha', async () => {
      await new IssueAuthToken(tokens, email).execute({
        account,
        purpose: 'invite',
        appUrl: APP_URL,
        nowMs: NOW,
      });

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0].to).toBe('pessoa@clinica.com');
      expect(email.sent[0].subject).toBe(
        'VittaFlow — defina sua senha de acesso',
      );
      expect(email.sent[0].text).toContain(`${APP_URL}/definir-senha?token=`);
      expect(email.sent[0].text).toContain('24 horas');
    });

    it('Dado APP_URL com barra final, Quando emitir, Então o link não duplica a barra', async () => {
      await new IssueAuthToken(tokens, email).execute({
        account,
        purpose: 'invite',
        appUrl: `${APP_URL}/`,
        nowMs: NOW,
      });

      expect(email.sent[0].text).toContain(`${APP_URL}/definir-senha?token=`);
      expect(email.sent[0].text).not.toContain('//definir-senha');
    });

    it('Dado o convite emitido, Quando conferir o repositório, Então guarda o hash do segredo do link', async () => {
      await new IssueAuthToken(tokens, email).execute({
        account,
        purpose: 'invite',
        appUrl: APP_URL,
        nowMs: NOW,
      });

      const secret = linkToken(email.sent[0].text);
      const stored = [...tokens.items.values()][0];
      expect(stored.secretHash).toBe(hashAuthTokenSecret(secret));
      expect(stored.purpose).toBe('invite');
      expect(stored.accountId).toBe(account.id);
    });
  });

  describe('Cenário: emitir reset (AUTH-10, AUTH-14)', () => {
    it('Dado propósito reset, Quando emitir, Então o assunto e a validade são os do reset', async () => {
      await new IssueAuthToken(tokens, email).execute({
        account,
        purpose: 'reset',
        appUrl: APP_URL,
        nowMs: NOW,
      });

      expect(email.sent[0].subject).toBe('VittaFlow — redefinição de senha');
      expect(email.sent[0].text).toContain('1 hora');
    });

    it('Dado um reset já emitido, Quando emitir outro, Então o primeiro link deixa de ser usável', async () => {
      const issue = new IssueAuthToken(tokens, email);
      await issue.execute({
        account,
        purpose: 'reset',
        appUrl: APP_URL,
        nowMs: NOW,
      });
      const first = linkToken(email.sent[0].text);

      await issue.execute({
        account,
        purpose: 'reset',
        appUrl: APP_URL,
        nowMs: NOW + 1000,
      });
      const second = linkToken(email.sent[1].text);

      expect(
        await tokens.findUsableBySecretHash(
          hashAuthTokenSecret(first),
          NOW + 2000,
        ),
      ).toBeNull();
      expect(
        await tokens.findUsableBySecretHash(
          hashAuthTokenSecret(second),
          NOW + 2000,
        ),
      ).not.toBeNull();
    });

    it('Dado um convite pendente, Quando emitir um reset, Então o convite continua usável (propósitos independentes)', async () => {
      const issue = new IssueAuthToken(tokens, email);
      await issue.execute({
        account,
        purpose: 'invite',
        appUrl: APP_URL,
        nowMs: NOW,
      });
      const invite = linkToken(email.sent[0].text);

      await issue.execute({
        account,
        purpose: 'reset',
        appUrl: APP_URL,
        nowMs: NOW + 1000,
      });

      expect(
        await tokens.findUsableBySecretHash(
          hashAuthTokenSecret(invite),
          NOW + 2000,
        ),
      ).not.toBeNull();
    });
  });

  describe('Cenário: consumir token (AUTH-05, AUTH-07)', () => {
    const issueInvite = async (nowMs = NOW): Promise<string> => {
      await new IssueAuthToken(tokens, email).execute({
        account,
        purpose: 'invite',
        appUrl: APP_URL,
        nowMs,
      });
      return linkToken(email.sent[email.sent.length - 1].text);
    };

    it('Dado token válido e senha de 8+ caracteres, Quando consumir, Então grava o hash da nova senha na conta', async () => {
      const secret = await issueInvite();

      await new ConsumeAuthToken(tokens, accounts).execute({
        secret,
        newPassword: 'senha-nova-1',
        expectedPurposes: ['invite', 'reset'],
        nowMs: NOW + 1000,
      });

      const updated = await accounts.findById(account.id);
      if (!updated) throw new Error('Conta não encontrada');
      expect(await verifyPassword('senha-nova-1', updated.passwordHash)).toBe(
        true,
      );
    });

    it('Dado token consumido, Quando consumir de novo, Então lança a mensagem única de link inválido', async () => {
      const secret = await issueInvite();
      const consume = new ConsumeAuthToken(tokens, accounts);
      await consume.execute({
        secret,
        newPassword: 'senha-nova-1',
        expectedPurposes: ['invite', 'reset'],
        nowMs: NOW + 1000,
      });

      await expect(
        consume.execute({
          secret,
          newPassword: 'outra-senha-9',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 2000,
        }),
      ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
    });

    it('Dado token expirado, Quando consumir, Então lança a mensagem única de link inválido', async () => {
      const secret = await issueInvite();

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'senha-nova-1',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 24 * 60 * 60 * 1000 + 1,
        }),
      ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
    });

    it('Dado token inexistente, Quando consumir, Então lança a mensagem única de link inválido', async () => {
      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret: 'token-que-nunca-existiu',
          newPassword: 'senha-nova-1',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW,
        }),
      ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
    });

    it('Dado conta inativa, Quando consumir um token válido dela, Então lança a mensagem única e não troca a senha', async () => {
      const secret = await issueInvite();
      await accounts.save(account.deactivate());

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'senha-nova-1',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 1000,
        }),
      ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
      const unchanged = await accounts.findById(account.id);
      if (!unchanged) throw new Error('Conta não encontrada');
      expect(await verifyPassword('senha-nova-1', unchanged.passwordHash)).toBe(
        false,
      );
    });

    it('Dado conta apagada entre a emissão e o consumo, Quando consumir, Então lança a mensagem única', async () => {
      const secret = await issueInvite();
      vi.spyOn(accounts, 'findById').mockResolvedValue(null);

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'senha-nova-1',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 1000,
        }),
      ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
      vi.restoreAllMocks();
    });

    it('Dado dois convites pendentes da mesma conta, Quando consumir um, Então o outro deixa de ser usável', async () => {
      // Os dois tokens são persistidos direto no repositório para isolar a
      // garantia do CONSUMO — passar pela emissão mascararia o caso, já que
      // emitir também invalida os anteriores.
      const first = AuthToken.issue({
        accountId: account.id,
        purpose: 'invite',
        nowMs: NOW,
      });
      const second = AuthToken.issue({
        accountId: account.id,
        purpose: 'invite',
        nowMs: NOW,
      });
      await tokens.save(first.token);
      await tokens.save(second.token);

      await new ConsumeAuthToken(tokens, accounts).execute({
        secret: first.secret,
        newPassword: 'senha-nova-1',
        expectedPurposes: ['invite', 'reset'],
        nowMs: NOW + 1000,
      });

      expect(
        await tokens.findUsableBySecretHash(
          hashAuthTokenSecret(second.secret),
          NOW + 2000,
        ),
      ).toBeNull();
    });

    it('Dado um convite e um reset pendentes, Quando consumir o convite, Então o reset continua usável (propósitos independentes)', async () => {
      const invite = AuthToken.issue({
        accountId: account.id,
        purpose: 'invite',
        nowMs: NOW,
      });
      const reset = AuthToken.issue({
        accountId: account.id,
        purpose: 'reset',
        nowMs: NOW,
      });
      await tokens.save(invite.token);
      await tokens.save(reset.token);

      await new ConsumeAuthToken(tokens, accounts).execute({
        secret: invite.secret,
        newPassword: 'senha-nova-1',
        expectedPurposes: ['invite', 'reset'],
        nowMs: NOW + 1000,
      });

      expect(
        await tokens.findUsableBySecretHash(
          hashAuthTokenSecret(reset.secret),
          NOW + 2000,
        ),
      ).not.toBeNull();
    });

    it('Dado senha com menos de 10 caracteres, Quando consumir, Então recusa e o token continua usável', async () => {
      const secret = await issueInvite();

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'curta7',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 1000,
        }),
      ).rejects.toThrow('ao menos 10 caracteres');
      expect(
        await tokens.findUsableBySecretHash(
          hashAuthTokenSecret(secret),
          NOW + 2000,
        ),
      ).not.toBeNull();
    });

    const stillUsable = async (secret: string) =>
      tokens.findUsableBySecretHash(hashAuthTokenSecret(secret), NOW + 2000);

    it('Dado conta da equipe e senha de 9 caracteres, Quando consumir, Então recusa pelo mínimo de 10 e o token continua usável (#291)', async () => {
      const secret = await issueInvite();

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'xk7#pq2vz',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 1000,
        }),
      ).rejects.toThrow('A senha precisa ter ao menos 10 caracteres');
      expect(await stillUsable(secret)).not.toBeNull();
    });

    it('Dado conta da equipe e senha comum, Quando consumir, Então recusa como comum e o token continua usável (#291)', async () => {
      const secret = await issueInvite();

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'Senha12345',
          expectedPurposes: ['invite', 'reset'],
          nowMs: NOW + 1000,
        }),
      ).rejects.toThrow(COMMON_PASSWORD_MESSAGE);
      expect(await stillUsable(secret)).not.toBeNull();
    });

    it('Dado conta da equipe e senha incomum de 10 caracteres, Quando consumir, Então grava a senha (#291)', async () => {
      const secret = await issueInvite();

      await new ConsumeAuthToken(tokens, accounts).execute({
        secret,
        newPassword: 'xk7#pq2vzm',
        expectedPurposes: ['invite', 'reset'],
        nowMs: NOW + 1000,
      });

      const updated = await accounts.findById(account.id);
      expect(
        await verifyPassword('xk7#pq2vzm', updated?.passwordHash ?? ''),
      ).toBe(true);
    });

    it.each([
      ['patient', '12345678', 'A senha precisa ter ao menos 10 caracteres'],
      ['partner', 'xk7#pq2vz', 'A senha precisa ter ao menos 10 caracteres'],
      ['patient', 'Senha12345', COMMON_PASSWORD_MESSAGE],
    ] as const)(
      'Dada conta %s e a senha %s, Quando consumir, Então recusa com a mensagem da equipe e o token continua usável (#309)',
      async (role, password, message) => {
        account = UserAccount.create({
          email: `${role}@clinica.com`,
          passwordHash: 'scrypt$0$sem-senha$sem-senha',
          role,
          clinicId: 'clinic-a',
        });
        await accounts.save(account);
        const secret = await issueInvite();

        await expect(
          new ConsumeAuthToken(tokens, accounts).execute({
            secret,
            newPassword: password,
            expectedPurposes: ['invite', 'reset'],
            nowMs: NOW + 1000,
          }),
        ).rejects.toThrow(message);
        expect(await stillUsable(secret)).not.toBeNull();
      },
    );

    it('Dada conta de paciente e senha incomum de 10 caracteres, Quando consumir, Então grava a senha (#309)', async () => {
      account = UserAccount.create({
        email: 'paciente@clinica.com',
        passwordHash: 'scrypt$0$sem-senha$sem-senha',
        role: 'patient',
        clinicId: 'clinic-a',
      });
      await accounts.save(account);
      const secret = await issueInvite();

      await new ConsumeAuthToken(tokens, accounts).execute({
        secret,
        newPassword: 'xk7#pq2vzm',
        expectedPurposes: ['invite', 'reset'],
        nowMs: NOW + 1000,
      });

      const updated = await accounts.findById(account.id);
      expect(
        await verifyPassword('xk7#pq2vzm', updated?.passwordHash ?? ''),
      ).toBe(true);
    });

    it("Dado token de propósito 'invite', Quando consumir esperando só 'reset', Então recusa com a mensagem única e não troca a senha (issue #46)", async () => {
      const secret = await issueInvite();

      await expect(
        new ConsumeAuthToken(tokens, accounts).execute({
          secret,
          newPassword: 'senha-nova-1',
          expectedPurposes: ['reset'],
          nowMs: NOW + 1000,
        }),
      ).rejects.toThrow(INVALID_TOKEN_MESSAGE);
      const account2 = await accounts.findById(account.id);
      if (!account2) throw new Error('Conta não encontrada');
      expect(await verifyPassword('senha-nova-1', account2.passwordHash)).toBe(
        false,
      );
    });
  });

  describe('Cenário: gateway nulo não bloqueia a emissão', () => {
    it('Dado o gateway nulo (dry-run), Quando emitir, Então o token é persistido mesmo sem envio real', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);

      await new IssueAuthToken(tokens, new NullEmailGateway()).execute({
        account,
        purpose: 'invite',
        appUrl: APP_URL,
        nowMs: NOW,
      });

      expect(tokens.items.size).toBe(1);
      vi.restoreAllMocks();
    });
  });
});
