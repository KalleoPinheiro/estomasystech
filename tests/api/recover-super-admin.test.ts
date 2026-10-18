import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { recoverSuperAdmin } from '@/infrastructure/persistence/drizzle/recover-super-admin';
import {
  authTokens,
  mfaRecoveryCodes,
  userAccounts,
  userMfa,
} from '@/infrastructure/persistence/drizzle/schema';
import { hashPassword } from '@/lib/auth/password';
import {
  createSessionToken,
  type Session,
  verifySessionToken,
} from '@/lib/auth/session';
import {
  clearSessionRevocationCache,
  isSessionRevoked,
} from '@/lib/auth/staff-revocation';
import { systemScope } from '@/lib/auth/tenant-scope';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
const AUTH_SECRET = 'segredo-do-teste-de-recuperacao';
process.env.AUTH_SECRET = AUTH_SECRET;

const APP_URL = 'https://clinica.exemplo.com.br';
const OLD_EMAIL = 'dono-antigo@estomasystech.test';
const NEW_EMAIL = 'dono-novo@estomasystech.test';
const OLD_PASSWORD = 'senha-que-vazou';
const NEW_PASSWORD = 'senha-nova-do-dono';

let loginRoute: typeof import('@/app/api/auth/login/route');
let setPasswordRoute: typeof import('@/app/api/auth/set-password/route');
let accountId: string;

let ip = 0;
async function post(
  handler: (request: NextRequest) => Promise<Response>,
  url: string,
  body: unknown,
) {
  ip += 1;
  const response = await handler(
    new NextRequest(`http://localhost${url}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `10.88.${Math.floor(ip / 250)}.${ip % 250}`,
      },
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as {
      data: { mfaEnrollmentRequired?: true; pendingToken?: string } | null;
    },
    cookie: response.headers.get('set-cookie'),
  };
}

const account = async () => {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(userAccounts)
    .where(eq(userAccounts.id, accountId));
  return row;
};

/** Sessão de super_admin como o `mfa/verify` emite: sem empresa. */
const systemSession = (email: string, sessionVersion: number): Session => {
  const session = verifySessionToken(
    AUTH_SECRET,
    createSessionToken(
      AUTH_SECRET,
      Date.now() + 60 * 60_000,
      email,
      'super_admin',
      null,
      null,
      sessionVersion,
    ),
  );
  if (!session) throw new Error('sessão de teste inválida');
  return session;
};

const revoked = (session: Session) => {
  // Outro processo, cache vencido: a consulta vai ao banco.
  clearSessionRevocationCache();
  return isSessionRevoked(session);
};

const recover = async (newEmail?: string) => {
  const result = await recoverSuperAdmin(await getDb(), {
    appUrl: APP_URL,
    confirm: true,
    newEmail,
  });
  if (!result.applied) throw new Error('esperava aplicado');
  return new URL(result.link).searchParams.get('token') ?? '';
};

beforeAll(async () => {
  loginRoute = await import('@/app/api/auth/login/route');
  setPasswordRoute = await import('@/app/api/auth/set-password/route');
  const created = UserAccount.create({
    email: OLD_EMAIL,
    passwordHash: await hashPassword(OLD_PASSWORD),
    role: 'super_admin',
    clinicId: null,
  });
  accountId = created.id;
  await (await getRepositories(systemScope())).userAccounts.save(created);
});

beforeEach(async () => {
  // Cada teste parte de um super_admin com fator e códigos cadastrados.
  const db = await getDb();
  await db.delete(mfaRecoveryCodes);
  await db.delete(userMfa);
  await db.insert(userMfa).values({
    accountId,
    totpSecret: 'segredo-cifrado-qualquer',
    enrolledAt: new Date(),
    lastUsedStep: 1,
  });
  await db.insert(mfaRecoveryCodes).values({
    id: `rc-${ip}`,
    accountId,
    codeHash: 'scrypt$x',
    createdAt: new Date(),
  });
});

describe('Feature: jornada 12 — o super_admin perdeu tudo (B3)', () => {
  it('Dado senha, e-mail e autenticador perdidos, Quando recuperar e definir a senha pelo link, Então perdeu tudo e o login exige recadastrar o fator', async () => {
    const token = await recover(NEW_EMAIL);

    const defined = await post(
      setPasswordRoute.POST,
      '/api/auth/set-password',
      {
        token,
        password: NEW_PASSWORD,
      },
    );
    expect(defined.status).toBe(200);

    const oldLogin = await post(loginRoute.POST, '/api/auth/login', {
      email: OLD_EMAIL,
      password: OLD_PASSWORD,
    });
    expect(oldLogin.status).toBe(401);

    const login = await post(loginRoute.POST, '/api/auth/login', {
      email: NEW_EMAIL,
      password: NEW_PASSWORD,
    });
    expect(login.status).toBe(200);
    expect(login.body.data?.mfaEnrollmentRequired).toBe(true);
    expect(login.body.data?.pendingToken).toMatch(/^mfa\./);
    expect(login.cookie).toBeNull();
  });

  it('Dado uma sessão aberta, Quando recuperar sem trocar o e-mail, Então a sessão anterior cai', async () => {
    const current = await account();
    const before = systemSession(current.email, current.sessionVersion);
    expect(await revoked(before)).toBe(false);

    await recover();

    expect(await revoked(before)).toBe(true);
  });

  it('Dado o e-mail trocado pela recuperação, Quando checar o cookie com o e-mail antigo, Então a sessão com o e-mail antigo cai mesmo com a versão atual', async () => {
    const current = await account();
    await recover('mais-um@estomasystech.test');
    const after = await account();

    expect(
      await revoked(systemSession(current.email, after.sessionVersion)),
    ).toBe(true);
  });

  it('Dado a conta de sistema, Quando checar uma sessão de sistema vigente, Então vale; sem conta de sistema, a lista negra vale', async () => {
    const current = await account();
    expect(
      await revoked(systemSession(current.email, current.sessionVersion)),
    ).toBe(false);
    // O e-mail do cookie é comparado como o login grava (minúsculas).
    expect(
      await revoked(
        systemSession(current.email.toUpperCase(), current.sessionVersion),
      ),
    ).toBe(false);

    const db = await getDb();
    await db.delete(mfaRecoveryCodes);
    await db.delete(userMfa);
    await db.delete(authTokens).where(eq(authTokens.accountId, accountId));
    await db.delete(userAccounts).where(eq(userAccounts.id, accountId));

    expect(await revoked(systemSession('qualquer@estomasystech.test', 9))).toBe(
      false,
    );
  });
});
