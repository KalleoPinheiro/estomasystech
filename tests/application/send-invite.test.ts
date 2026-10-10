import { afterEach, describe, expect, it, vi } from 'vitest';
import { appUrlFromEnv, sendInvite } from '@/application/auth/send-invite';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import type {
  AuthToken,
  AuthTokenPurpose,
  AuthTokenRepository,
} from '@/domain/auth/auth-token';
import { UserAccount } from '@/domain/auth/user-account';

class InMemoryAuthTokenRepository implements AuthTokenRepository {
  readonly items = new Map<string, AuthToken>();
  async save(token: AuthToken): Promise<void> {
    this.items.set(token.id, token);
  }
  async claimBySecretHash(): Promise<AuthToken | null> {
    return null;
  }
  async markAllUnusedAsUsed(
    accountId: string,
    purpose: AuthTokenPurpose,
    usedAt: Date = new Date(),
  ): Promise<void> {
    for (const [id, item] of this.items) {
      if (
        item.accountId === accountId &&
        item.purpose === purpose &&
        item.usedAt === null
      ) {
        this.items.set(id, item.markUsed(usedAt));
      }
    }
  }
  /** Espelha o contrato real (issue #50): invalida os irmãos, depois salva. */
  async replaceUnused(
    token: AuthToken,
    usedAt: Date = new Date(),
  ): Promise<void> {
    await this.markAllUnusedAsUsed(token.accountId, token.purpose, usedAt);
    await this.save(token);
  }
}

class ThrowingEmailGateway implements EmailGateway {
  async isEnabled(): Promise<boolean> {
    return true;
  }
  async send(_message: EmailMessage): Promise<void> {
    throw new Error('provedor fora do ar');
  }
}

class WorkingEmailGateway implements EmailGateway {
  constructor(private readonly enabled: boolean) {}
  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }
  async send(_message: EmailMessage): Promise<void> {}
}

const account = () =>
  UserAccount.create({
    email: 'convidado@clinica.com',
    passwordHash: 'scrypt$0$sem-senha$sem-senha',
    role: 'atendente',
    clinicId: 'legacy-clinic',
  });

/**
 * Issue #52: `sendInvite` engolia a falha de envio sem devolver sinal nenhum
 * ao chamador — só logava. Agora precisa devolver `delivered`.
 */
describe('Feature: sendInvite devolve o resultado da entrega (issue #52)', () => {
  it('Dado envio bem-sucedido com canal ativo, Quando sendInvite, Então delivered é true', async () => {
    const result = await sendInvite(
      {
        authTokens: new InMemoryAuthTokenRepository(),
        email: new WorkingEmailGateway(true),
      },
      account(),
    );

    expect(result).toEqual({ delivered: true });
  });

  it('Dado o gateway em dry-run (enabled false), Quando sendInvite, Então delivered é false mesmo sem lançar', async () => {
    const result = await sendInvite(
      {
        authTokens: new InMemoryAuthTokenRepository(),
        email: new WorkingEmailGateway(false),
      },
      account(),
    );

    expect(result).toEqual({ delivered: false });
  });

  it('Dado o envio falhando, Quando sendInvite, Então NÃO lança e delivered é false', async () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await sendInvite(
      {
        authTokens: new InMemoryAuthTokenRepository(),
        email: new ThrowingEmailGateway(),
      },
      account(),
    );

    expect(result).toEqual({ delivered: false });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

/**
 * O link de convite/reset carrega um segredo de uso único que define a senha da
 * conta — em produção ele não pode sair por `http://` nem apontar para
 * `localhost` por falta de configuração.
 */
describe('Feature: Base pública dos links de convite e reset', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
  });

  it('Dado ambiente de desenvolvimento sem APP_URL, Quando ler, Então cai no localhost', () => {
    delete process.env.APP_URL;

    expect(appUrlFromEnv()).toBe('http://localhost:3000');
  });

  it('Dado APP_URL configurada fora de produção, Quando ler, Então usa o valor configurado', () => {
    process.env.APP_URL = 'http://staging.local:3000';

    expect(appUrlFromEnv()).toBe('http://staging.local:3000');
  });

  it('Dado produção com APP_URL https, Quando ler, Então usa o valor configurado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_URL = 'https://clinica.exemplo.com';

    expect(appUrlFromEnv()).toBe('https://clinica.exemplo.com');
  });

  it('Dado produção sem APP_URL, Quando ler, Então lança em vez de apontar para localhost', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.APP_URL;

    expect(() => appUrlFromEnv()).toThrow(/APP_URL precisa ser uma URL https/);
  });

  it('Dado produção com APP_URL http num host remoto, Quando ler, Então lança (segredo não trafega em claro)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_URL = 'http://clinica.exemplo.com';

    expect(() => appUrlFromEnv()).toThrow(/https/);
  });

  it('Dado produção com APP_URL http em loopback, Quando ler, Então aceita (docker compose local)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_URL = 'http://localhost:3000';

    expect(appUrlFromEnv()).toBe('http://localhost:3000');
  });

  it('Dado produção com APP_URL malformada, Quando ler, Então lança em vez de montar um link quebrado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_URL = 'nao-e-uma-url';

    expect(() => appUrlFromEnv()).toThrow(/https/);
  });
});
