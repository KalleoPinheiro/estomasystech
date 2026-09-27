import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { clearSessionRevocationCache } from '@/lib/auth/staff-revocation';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { proxy } from '@/proxy';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import {
  spyOnSentEmails,
  tokenFromLastEmail,
  waitForEmails,
} from '../support/email';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

const PASSWORD = 'senha-forte-123';
let counter = 0;

const repos = () => getRepositories(clinicScope(CLINIC_A_ID));

/** Conta ativa com senha conhecida na empresa A. */
async function seedAccount(role: UserAccount['role'] = 'atendente') {
  await ensureTestClinics();
  counter += 1;
  const account = UserAccount.create({
    email: `revoga-${counter}@clinica.com`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    clinicId: CLINIC_A_ID,
  });
  await (await repos()).userAccounts.save(account);
  return account;
}

const versionOf = async (id: string): Promise<number> =>
  (await (await repos()).userAccounts.findById(id))?.sessionVersion ?? -1;

let ipCounter = 0;
const freshIp = (): Record<string, string> => {
  ipCounter += 1;
  return { 'x-forwarded-for': `10.9.0.${ipCounter}` };
};

/** Faz login pela rota real e devolve o cookie de sessão emitido. */
async function loginCookie(email: string): Promise<string> {
  const route = await import('@/app/api/auth/login/route');
  const response = await route.POST(
    jsonRequest(
      '/api/auth/login',
      'POST',
      { email, password: PASSWORD },
      freshIp(),
    ),
  );
  expect(response.status).toBe(200);
  const token = response.cookies.get(SESSION_COOKIE)?.value;
  expect(token).toBeTruthy();
  return `${SESSION_COOKIE}=${token}`;
}

/** Status que o proxy (camada 1) dá para uma chamada de API com este cookie. */
async function proxyStatus(cookie: string): Promise<number> {
  const response = await proxy(
    new NextRequest('http://localhost/api/patients', {
      headers: { cookie, ...freshIp() },
    }),
  );
  return response.status;
}

describe('Feature: Revogação de sessão por versão (#194, ADR-005)', () => {
  beforeEach(() => {
    clearSessionRevocationCache();
  });

  it('login mints current version: o token nasce com a versão vigente da conta', async () => {
    const account = await seedAccount();
    await (await repos()).userAccounts.revokeSessions(account.id);
    await (await repos()).userAccounts.revokeSessions(account.id);

    const cookie = await loginCookie(account.email);
    const session = verifySessionToken(
      process.env.AUTH_SECRET as string,
      cookie.split('=')[1],
    );

    expect(session?.sessionVersion).toBe(2);
    expect(await proxyStatus(cookie)).toBe(200);
  });

  it('logout revokes previous token: o cookie anterior passa a receber 401 no proxy', async () => {
    const account = await seedAccount();
    const cookie = await loginCookie(account.email);
    expect(await proxyStatus(cookie)).toBe(200);

    const logout = await import('@/app/api/auth/logout/route');
    const response = await logout.POST(
      new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { cookie },
      }),
    );

    expect(response.status).toBe(200);
    expect(await versionOf(account.id)).toBe(1);
    // O mesmo token, copiado antes do logout, não vale mais.
    expect(await proxyStatus(cookie)).toBe(401);
    // Um login novo volta a funcionar.
    expect(await proxyStatus(await loginCookie(account.email))).toBe(200);
  });

  it('set-password revokes sessions: reset pelo link incrementa a versão e derruba o cookie', async () => {
    const account = await seedAccount();
    const cookie = await loginCookie(account.email);
    const emails = spyOnSentEmails();
    try {
      const forgot = await import('@/app/api/auth/forgot-password/route');
      await forgot.POST(
        jsonRequest(
          '/api/auth/forgot-password',
          'POST',
          { email: account.email },
          freshIp(),
        ),
      );
      await waitForEmails(emails, 1);
      const setPassword = await import('@/app/api/auth/set-password/route');
      const response = await setPassword.POST(
        jsonRequest(
          '/api/auth/set-password',
          'POST',
          { token: tokenFromLastEmail(emails), password: 'outra-senha-456' },
          freshIp(),
        ),
      );
      expect(response.status).toBe(200);
    } finally {
      emails.restore();
    }

    expect(await versionOf(account.id)).toBe(1);
    expect(await proxyStatus(cookie)).toBe(401);
  });

  it('admin password change revokes sessions: PATCH com senha incrementa a versão', async () => {
    const account = await seedAccount();
    const cookie = await loginCookie(account.email);
    const route = await import('@/app/api/accounts/[id]/route');

    const response = await route.PATCH(
      jsonRequest(
        `/api/accounts/${account.id}`,
        'PATCH',
        { password: 'nova-senha-789' },
        cookieHeaderFor('company_admin', 'admin-revoga@x.com', CLINIC_A_ID),
      ),
      { params: Promise.resolve({ id: account.id }) },
    );

    expect(response.status).toBe(200);
    expect(await versionOf(account.id)).toBe(1);
    expect(await proxyStatus(cookie)).toBe(401);
  });

  it('deactivation revokes sessions: PATCH active=false incrementa a versão; reativar não', async () => {
    const account = await seedAccount();
    const route = await import('@/app/api/accounts/[id]/route');
    const patch = (active: boolean) =>
      route.PATCH(
        jsonRequest(
          `/api/accounts/${account.id}`,
          'PATCH',
          { active },
          cookieHeaderFor('company_admin', 'admin-revoga@x.com', CLINIC_A_ID),
        ),
        { params: Promise.resolve({ id: account.id }) },
      );

    expect((await patch(false)).status).toBe(200);
    expect(await versionOf(account.id)).toBe(1);
    expect((await patch(true)).status).toBe(200);
    expect(await versionOf(account.id)).toBe(1);
  });

  it('save keeps session version: gravar a conta lida antes do incremento não o desfaz', async () => {
    const account = await seedAccount();
    const { userAccounts } = await repos();
    const stale = await userAccounts.findById(account.id);

    await userAccounts.revokeSessions(account.id);
    await userAccounts.save((stale as UserAccount).deactivate());

    const stored = await userAccounts.findById(account.id);
    expect(stored?.sessionVersion).toBe(1);
    expect(stored?.isActive).toBe(false);
  });
});
