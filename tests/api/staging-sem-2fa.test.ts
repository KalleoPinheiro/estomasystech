import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { Clinic } from '@/domain/clinic/clinic';
import { getRepositories } from '@/infrastructure/container';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const PASSWORD = 'senha-forte-123';
const originalEnv = { ...process.env };
let ipCounter = 0;

async function seedAdmin(email: string) {
  const clinicId = `sem2fa-${email.split('@')[0]}`;
  const { clinics } = await getRepositories(clinicScope(clinicId));
  await clinics.create(
    Clinic.restore({
      id: clinicId,
      name: clinicId,
      createdBy: 'fixture',
      createdAt: new Date(),
    }),
  );
  const { userAccounts } = await getRepositories(systemScope());
  await userAccounts.save(
    UserAccount.create({
      email,
      passwordHash: await hashPassword(PASSWORD),
      role: 'company_admin',
      clinicId,
    }),
  );
}

async function login(email: string) {
  ipCounter += 1;
  const route = await import('@/app/api/auth/login/route');
  const response = await route.POST(
    jsonRequest(
      '/api/auth/login',
      'POST',
      { email, password: PASSWORD },
      { 'x-forwarded-for': `10.66.0.${ipCounter}` },
    ),
  );
  const body = (await response.json()) as {
    data: { mfaRequired?: boolean; mfaEnrollmentRequired?: boolean };
  };
  return {
    status: response.status,
    data: body.data,
    hasSession: response.cookies.get(SESSION_COOKIE) !== undefined,
  };
}

describe('Feature: Login de admin na staging sem segundo fator (ADR-054)', () => {
  beforeAll(async () => {
    await seedAdmin('admin-a@sem2fa.test');
    await seedAdmin('admin-b@sem2fa.test');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('Dado staging com STAGING_DISABLE_MFA=true, Quando o admin entra com e-mail e senha, Então recebe a sessão sem cadastrar nem digitar código', async () => {
    process.env.APP_ENV = 'staging';
    process.env.STAGING_DISABLE_MFA = 'true';

    const result = await login('admin-a@sem2fa.test');

    expect(result.status).toBe(200);
    expect(result.hasSession).toBe(true);
    expect(result.data.mfaRequired).toBeUndefined();
    expect(result.data.mfaEnrollmentRequired).toBeUndefined();
  });

  it.each(['production', 'preview', 'development'])(
    'Dado APP_ENV=%s com a variável ligada, Quando o admin entra, Então o segundo fator continua exigido e não há sessão',
    async (appEnv) => {
      process.env.APP_ENV = appEnv;
      process.env.STAGING_DISABLE_MFA = 'true';

      const result = await login('admin-b@sem2fa.test');

      expect(result.status).toBe(200);
      expect(result.hasSession).toBe(false);
      expect(result.data.mfaEnrollmentRequired).toBe(true);
    },
  );

  it('Dado staging sem a variável, Quando o admin entra, Então o segundo fator continua exigido', async () => {
    process.env.APP_ENV = 'staging';
    delete process.env.STAGING_DISABLE_MFA;

    const result = await login('admin-b@sem2fa.test');

    expect(result.hasSession).toBe(false);
    expect(result.data.mfaEnrollmentRequired).toBe(true);
  });
});
