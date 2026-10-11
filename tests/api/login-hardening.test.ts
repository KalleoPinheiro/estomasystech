import { beforeAll, describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleUserAccountRepository } from '@/infrastructure/persistence/drizzle/drizzle-foundation-repositories';
import { rateLimitWindows } from '@/infrastructure/persistence/drizzle/schema';
import {
  hashPassword,
  PASSWORD_COST,
  simulatePasswordCheck,
  verifyPassword,
} from '@/lib/auth/password';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { systemScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID } from '../support/clinics';
import { jsonRequest } from '../support/request';

process.env.VITTA_DB_DRIVER = 'pglite';

// Espiona o verificador fictício sem trocar o comportamento (#208).
vi.mock('@/lib/auth/password', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth/password')>();
  return {
    ...original,
    simulatePasswordCheck: vi.fn(original.simulatePasswordCheck),
  };
});

const PASSWORD = 'senha-antiga-123';
const LEGACY_COST = 16_384;
const TOO_MANY = 'Muitas tentativas de login, aguarde um minuto';

let seq = 0;
let ipCounter = 0;

async function seedAccount(passwordHash: string): Promise<UserAccount> {
  seq += 1;
  const account = UserAccount.create({
    email: `hardening-${seq}@login.test`,
    passwordHash,
    // Papel sem 2FA obrigatório: a senha certa já rende a sessão (#291).
    role: 'atendente',
    clinicId: CLINIC_A_ID,
  });
  await (await getRepositories(systemScope())).userAccounts.save(account);
  return account;
}

async function storedAccount(id: string): Promise<UserAccount> {
  const { userAccounts } = await getRepositories(systemScope());
  return (await userAccounts.findById(id)) as UserAccount;
}

/** Cada chamada sai de um IP novo: isola o limite por e-mail do limite por IP. */
async function login(email: string, password = PASSWORD) {
  ipCounter += 1;
  const route = await import('@/app/api/auth/login/route');
  const response = await route.POST(
    jsonRequest(
      '/api/auth/login',
      'POST',
      { email, password },
      {
        'x-forwarded-for': `10.208.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`,
      },
    ),
  );
  const body = (await response.json()) as { error: string | null };
  return {
    status: response.status,
    error: body.error,
    cookie: response.cookies.get(SESSION_COOKIE)?.value ?? null,
  };
}

describe('Feature: Login endurecido (#208)', () => {
  let legacyHash = '';

  beforeAll(async () => {
    // Mesmo formato e custo das senhas gravadas antes do #208.
    legacyHash = await hashPassword(PASSWORD, LEGACY_COST);
  });

  describe('Cenário: oráculo de tempo', () => {
    it('Dado e-mail sem conta, Quando POST login, Então roda o scrypt fictício e responde 401 genérico', async () => {
      vi.mocked(simulatePasswordCheck).mockClear();

      const result = await login('ninguem-208@login.test', 'qualquer-senha');

      expect(result.status).toBe(401);
      expect(result.error).toBe('Email ou senha incorretos');
      expect(simulatePasswordCheck).toHaveBeenCalledWith('qualquer-senha');
    });

    it('Dado conta existente e senha errada, Quando POST login, Então verifica contra o hash real com a mesma resposta 401', async () => {
      const account = await seedAccount(await hashPassword(PASSWORD));
      vi.mocked(simulatePasswordCheck).mockClear();

      const result = await login(account.email, 'senha-errada');

      expect(result.status).toBe(401);
      expect(result.error).toBe('Email ou senha incorretos');
      expect(simulatePasswordCheck).not.toHaveBeenCalled();
    });

    it('Dado conta com hash de custo antigo ainda não refeito, Quando POST login, Então o scrypt fictício do custo atual roda junto (sem resposta mais rápida)', async () => {
      const account = await seedAccount(legacyHash);
      vi.mocked(simulatePasswordCheck).mockClear();

      const result = await login(account.email, 'senha-errada');

      expect(result.status).toBe(401);
      expect(simulatePasswordCheck).toHaveBeenCalledWith('senha-errada');
    });
  });

  describe('Cenário: limite por conta', () => {
    it('Dado 5 tentativas no mesmo e-mail vindas de IPs diferentes, Quando a 6ª chega de outro IP, Então responde 429 com a mesma mensagem do limite por IP', async () => {
      const account = await seedAccount(await hashPassword(PASSWORD));
      const variants = [
        account.email,
        account.email.toUpperCase(),
        ` ${account.email} `,
      ];

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        statuses.push(
          (await login(variants[attempt % variants.length], 'errada')).status,
        );
      }
      const blocked = await login(account.email);

      expect(statuses).toEqual([401, 401, 401, 401, 401]);
      expect(blocked.status).toBe(429);
      expect(blocked.error).toBe(TOO_MANY);
      expect(blocked.cookie).toBeNull();
    });

    it('Dado e-mail sem conta, Quando estoura o limite, Então responde o mesmo 429 — o limite não revela se a conta existe', async () => {
      const email = 'fantasma-208@login.test';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login(email, 'errada');
      }

      const blocked = await login(email, 'errada');

      expect(blocked.status).toBe(429);
      expect(blocked.error).toBe(TOO_MANY);
    });

    it('Dado tentativas por e-mail, Quando o limite conta, Então a tabela guarda o hash — nunca o e-mail em claro (LGPD)', async () => {
      const email = 'em-claro-208@login.test';
      await login(email, 'errada');

      const keys = (await (await getDb()).select().from(rateLimitWindows)).map(
        (row) => row.key,
      );

      expect(keys.some((key) => key.startsWith('login-account:'))).toBe(true);
      expect(keys.some((key) => key.includes(email))).toBe(false);
    });

    it('Dado um e-mail bloqueado, Quando outra conta tenta, Então ela não é afetada', async () => {
      const blockedAccount = await seedAccount(await hashPassword(PASSWORD));
      const other = await seedAccount(await hashPassword(PASSWORD));
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await login(blockedAccount.email, 'errada');
      }

      const result = await login(other.email);

      expect(result.status).toBe(200);
      expect(result.cookie).not.toBeNull();
    });
  });

  describe('Cenário: custo do scrypt e re-hash transparente', () => {
    it('Dado conta com hash de custo antigo, Quando entra com a senha certa, Então entra, o hash passa a 2^17 sem derrubar sessões e a senha segue valendo', async () => {
      const account = await seedAccount(legacyHash);

      const first = await login(account.email);

      expect(first.status).toBe(200);
      expect(first.cookie).not.toBeNull();
      const upgraded = await storedAccount(account.id);
      expect(upgraded.passwordHash.split('$')[1]).toBe(String(PASSWORD_COST));
      expect(upgraded.passwordHash).not.toBe(legacyHash);
      expect(upgraded.sessionVersion).toBe(account.sessionVersion);
      expect(await verifyPassword(PASSWORD, upgraded.passwordHash)).toBe(true);

      const second = await login(account.email);
      expect(second.status).toBe(200);
      expect((await storedAccount(account.id)).passwordHash).toBe(
        upgraded.passwordHash,
      );
    });

    it('Dado conta com hash de custo antigo, Quando erra a senha, Então o hash antigo fica intacto', async () => {
      const account = await seedAccount(legacyHash);

      const result = await login(account.email, 'senha-errada');

      expect(result.status).toBe(401);
      expect((await storedAccount(account.id)).passwordHash).toBe(legacyHash);
    });

    it('Dado falha ao gravar o hash novo, Quando entra com a senha certa, Então o login passa e o hash antigo segue valendo', async () => {
      const account = await seedAccount(legacyHash);
      const spy = vi
        .spyOn(DrizzleUserAccountRepository.prototype, 'upgradePasswordHash')
        .mockRejectedValueOnce(new Error('banco fora'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await login(account.email);

      expect(spy).toHaveBeenCalledOnce();
      expect(result.status).toBe(200);
      expect((await storedAccount(account.id)).passwordHash).toBe(legacyHash);
      vi.restoreAllMocks();
    });

    it('Dado senha trocada depois da leitura, Quando o re-hash grava, Então não sobrescreve a senha nova (#208)', async () => {
      const account = await seedAccount(legacyHash);
      const { userAccounts } = await getRepositories(systemScope());
      const newHash = await hashPassword('senha-nova-456');
      await userAccounts.updatePasswordHash(account.id, newHash);

      await userAccounts.upgradePasswordHash(
        account.id,
        legacyHash,
        await hashPassword(PASSWORD),
      );

      expect((await storedAccount(account.id)).passwordHash).toBe(newHash);
    });
  });
});
