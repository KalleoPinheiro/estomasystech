import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { generateTotpSecret, totpCode, totpStep } from '@/domain/auth/totp';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import {
  auditEvents,
  mfaRecoveryCodes,
  userMfa,
} from '@/infrastructure/persistence/drizzle/schema';
import { createMfaPendingToken } from '@/lib/auth/mfa-pending-token';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';

process.env.VITTA_DB_DRIVER = 'pglite';
const AUTH_SECRET = 'segredo-do-teste-de-2fa-por-papel';
process.env.AUTH_SECRET = AUTH_SECRET;

const PASSWORD = 'senha-da-equipe-291';
const EXPIRED = 'Verificação expirada. Entre novamente com e-mail e senha.';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface LoginData {
  ok?: true;
  mfaRequired?: true;
  mfaEnrollmentRequired?: true;
  pendingToken?: string;
}

let loginRoute: typeof import('@/app/api/auth/login/route');
let enrollRoute: typeof import('@/app/api/auth/mfa/enroll/route');
let verifyRoute: typeof import('@/app/api/auth/mfa/verify/route');

/** Relógio controlado: cada teste começa 10 min depois, fora do limite 5/min. */
let clock = Date.UTC(2026, 9, 11, 12, 0, 0);
vi.spyOn(Date, 'now').mockImplementation(() => clock);

let ip = 0;
async function call<T>(
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
        'x-forwarded-for': `10.91.${Math.floor(ip / 250)}.${ip % 250}`,
      },
    }),
  );
  return {
    status: response.status,
    body: (await response.json()) as Envelope<T>,
    cookie: response.headers.get('set-cookie'),
  };
}

const sessionOf = (cookie: string | null) =>
  verifySessionToken(
    AUTH_SECRET,
    cookie?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1],
  );

let seq = 0;
async function seedAccount(role: UserRole): Promise<UserAccount> {
  seq += 1;
  const account = UserAccount.create({
    email: `papel-${role}-${seq}@mfa291.test`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    clinicId: CLINIC_A_ID,
  });
  await (await getRepositories(clinicScope(CLINIC_A_ID))).userAccounts.save(
    account,
  );
  return account;
}

/** Fator já confirmado, como se a conta tivesse cadastrado pela "Minha conta". */
async function seedFactor(account: UserAccount): Promise<string> {
  const secret = generateTotpSecret();
  const { mfa } = await getRepositories(systemScope());
  await mfa.completeEnrollment({
    accountId: account.id,
    secret,
    step: totpStep(clock) - 10,
    recoveryCodeHashes: ['hash-irrelevante-para-o-teste'],
    expectedSessionVersion: account.sessionVersion,
    now: new Date(clock),
  });
  return secret;
}

const login = (account: UserAccount) =>
  call<LoginData>(loginRoute.POST, '/api/auth/login', {
    email: account.email,
    password: PASSWORD,
  });

beforeAll(async () => {
  await ensureTestClinics();
  loginRoute = await import('@/app/api/auth/login/route');
  enrollRoute = await import('@/app/api/auth/mfa/enroll/route');
  verifyRoute = await import('@/app/api/auth/mfa/verify/route');
});

beforeEach(async () => {
  clock += 10 * 60_000;
  const db = await getDb();
  await db.delete(mfaRecoveryCodes);
  await db.delete(userMfa);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('Feature: Segundo fator por papel (#291, ADR-012)', () => {
  describe('company_admin: obrigatório', () => {
    it('Dado Admin sem fator, Quando entrar com a senha, Então é levado ao cadastro do autenticador, sem sessão', async () => {
      const admin = await seedAccount('company_admin');

      const { status, body, cookie } = await login(admin);

      expect(status).toBe(200);
      expect(body.data).toEqual({
        mfaEnrollmentRequired: true,
        pendingToken: expect.stringMatching(/^mfa\./),
      });
      expect(cookie).toBeNull();
    });

    it('Dado Admin sem fator, Quando cadastrar e confirmar o código, Então recebe 10 códigos e a sessão da própria clínica', async () => {
      const admin = await seedAccount('company_admin');
      const started = await login(admin);
      const enrolled = await call<{ secret: string; pendingToken: string }>(
        enrollRoute.POST,
        '/api/auth/mfa/enroll',
        { pendingToken: started.body.data.pendingToken },
      );
      const confirmed = await call<{ recoveryCodes: string[] }>(
        verifyRoute.POST,
        '/api/auth/mfa/verify',
        {
          pendingToken: enrolled.body.data.pendingToken,
          code: totpCode(enrolled.body.data.secret, totpStep(clock)),
        },
      );

      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.recoveryCodes).toHaveLength(10);
      const session = sessionOf(confirmed.cookie);
      expect(session?.role).toBe('company_admin');
      expect(session?.subject).toBe(admin.email);
      expect(session?.clinicId).toBe(CLINIC_A_ID);
      expect(session?.sessionVersion).toBe(admin.sessionVersion + 1);
      // O cadastro fica na trilha da clínica do Admin, não na de plataforma.
      const db = await getDb();
      const [event] = await db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.actorId, admin.email),
            eq(auditEvents.detail, 'mfa_enrolled'),
          ),
        );
      expect(event?.clinicId).toBe(CLINIC_A_ID);
    });

    it('Dado Admin com fator, Quando entrar com a senha e o código, Então o login pede o código e só ele emite a sessão', async () => {
      const admin = await seedAccount('company_admin');
      const secret = await seedFactor(admin);

      const started = await login(admin);
      expect(started.body.data).toEqual({
        mfaRequired: true,
        pendingToken: expect.stringMatching(/^mfa\./),
      });
      expect(started.cookie).toBeNull();

      const verified = await call<{ ok: true }>(
        verifyRoute.POST,
        '/api/auth/mfa/verify',
        {
          pendingToken: started.body.data.pendingToken,
          code: totpCode(secret, totpStep(clock)),
        },
      );
      expect(verified.status).toBe(200);
      expect(sessionOf(verified.cookie)?.clinicId).toBe(CLINIC_A_ID);
    });
  });

  describe('atendente e profissional: opcional', () => {
    it.each(['atendente', 'profissional'] as const)(
      'Dado %s sem fator, Quando entrar com a senha, Então recebe a sessão direto',
      async (role) => {
        const account = await seedAccount(role);

        const result = await login(account);

        expect(result.body.data).toEqual({ ok: true });
        expect(sessionOf(result.cookie)?.role).toBe(role);
      },
    );

    it.each(['atendente', 'profissional'] as const)(
      'Dado %s com fator cadastrado, Quando entrar com a senha, Então o login pede o código',
      async (role) => {
        const account = await seedAccount(role);
        const secret = await seedFactor(account);

        const started = await login(account);
        expect(started.body.data.mfaRequired).toBe(true);
        expect(started.cookie).toBeNull();

        const verified = await call<{ ok: true }>(
          verifyRoute.POST,
          '/api/auth/mfa/verify',
          {
            pendingToken: started.body.data.pendingToken,
            code: totpCode(secret, totpStep(clock)),
          },
        );
        expect(sessionOf(verified.cookie)?.role).toBe(role);
      },
    );
  });

  describe('portais: sem segundo fator', () => {
    it('Dado paciente, Quando entrar com a senha, Então recebe a sessão direto', async () => {
      const patient = await seedAccount('patient');

      const result = await login(patient);

      expect(result.body.data).toEqual({ ok: true });
      expect(sessionOf(result.cookie)?.role).toBe('patient');
    });

    it('Dado token pendente forjado para paciente, Quando verificar, Então 401 de verificação expirada', async () => {
      const patient = await seedAccount('patient');
      const pendingToken = createMfaPendingToken(
        AUTH_SECRET,
        {
          accountId: patient.id,
          sessionVersion: patient.sessionVersion,
          stage: 'enroll',
        },
        clock,
      );

      const result = await call(enrollRoute.POST, '/api/auth/mfa/enroll', {
        pendingToken,
      });

      expect(result.status).toBe(401);
      expect(result.body.error).toBe(EXPIRED);
    });
  });
});
