import { eq, sql } from 'drizzle-orm';
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
import { totpCode, totpStep } from '@/domain/auth/totp';
import { UserAccount } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import {
  auditEvents,
  mfaRecoveryCodes,
  userAccounts,
  userMfa,
} from '@/infrastructure/persistence/drizzle/schema';
import { createMfaPendingToken } from '@/lib/auth/mfa-pending-token';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';

process.env.VITTA_DB_DRIVER = 'pglite';
const AUTH_SECRET = 'segredo-do-teste-de-segundo-fator';
process.env.AUTH_SECRET = AUTH_SECRET;

const EMAIL = 'dono@vitta.test';
const PASSWORD = 'senha-do-super-admin';
const EXPIRED = 'Verificação expirada. Entre novamente com e-mail e senha.';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface PendingData {
  mfaRequired?: true;
  mfaEnrollmentRequired?: true;
  pendingToken: string;
}

let loginRoute: typeof import('@/app/api/auth/login/route');
let enrollRoute: typeof import('@/app/api/auth/mfa/enroll/route');
let verifyRoute: typeof import('@/app/api/auth/mfa/verify/route');
let superAdmin: UserAccount;

/**
 * Relógio controlado: TOTP, validade do token e limite de tentativas leem
 * `Date.now()`. Cada teste começa 10 min depois do anterior, então o limite
 * por conta (5/min) de um teste não vaza para o próximo.
 */
let clock = Date.UTC(2026, 8, 27, 12, 0, 0);
vi.spyOn(Date, 'now').mockImplementation(() => clock);

let ip = 0;
const post = (url: string, body: unknown) => {
  ip += 1;
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': `10.77.${Math.floor(ip / 250)}.${ip % 250}`,
    },
  });
};

async function call<T>(
  handler: (request: NextRequest) => Promise<Response>,
  url: string,
  body: unknown,
) {
  const response = await handler(post(url, body));
  return {
    status: response.status,
    body: (await response.json()) as Envelope<T>,
    cookie: response.headers.get('set-cookie'),
  };
}

const login = () =>
  call<PendingData>(loginRoute.POST, '/api/auth/login', {
    email: EMAIL,
    password: PASSWORD,
  });
const enroll = (pendingToken: string) =>
  call<{ secret: string; otpauthUri: string; pendingToken: string }>(
    enrollRoute.POST,
    '/api/auth/mfa/enroll',
    { pendingToken },
  );
const verify = <T = { ok: true }>(body: Record<string, unknown>) =>
  call<T>(verifyRoute.POST, '/api/auth/mfa/verify', body);

const codeNow = (secret: string, delta = 0) =>
  totpCode(secret, totpStep(clock) + delta);

/** Login → cadastro → confirmação; devolve a chave e os códigos. */
async function enrollFactor() {
  const started = await login();
  const enrolled = await enroll(started.body.data.pendingToken);
  const confirmed = await verify<{ recoveryCodes: string[] }>({
    pendingToken: enrolled.body.data.pendingToken,
    code: codeNow(enrolled.body.data.secret),
  });
  expect(confirmed.status).toBe(200);
  // Próximo login em outro passo de 30 s e fora da janela do limite (5/min).
  clock += 2 * 60_000;
  return {
    secret: enrolled.body.data.secret,
    recoveryCodes: confirmed.body.data.recoveryCodes,
  };
}

const sessionOf = (cookie: string | null) =>
  verifySessionToken(
    AUTH_SECRET,
    cookie?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1],
  );

const versionOf = async () =>
  (
    await (
      await getRepositories(systemScope())
    ).userAccounts.findById(superAdmin.id)
  )?.sessionVersion ?? -1;

beforeAll(async () => {
  await ensureTestClinics();
  loginRoute = await import('@/app/api/auth/login/route');
  enrollRoute = await import('@/app/api/auth/mfa/enroll/route');
  verifyRoute = await import('@/app/api/auth/mfa/verify/route');
  superAdmin = UserAccount.create({
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    role: 'super_admin',
    clinicId: null,
  });
  await (await getRepositories(systemScope())).userAccounts.save(superAdmin);
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

describe('Feature: Login do super_admin em duas etapas (B2, ADR-007)', () => {
  describe('POST /api/auth/login', () => {
    it('Dado super_admin sem fator, Quando entrar com a senha, Então sem fator, o login exige o cadastro e não emite sessão', async () => {
      const { status, body, cookie } = await login();

      expect(status).toBe(200);
      expect(body.data.mfaEnrollmentRequired).toBe(true);
      expect(body.data.mfaRequired).toBeUndefined();
      expect(body.data.pendingToken).toMatch(/^mfa\./);
      expect(cookie).toBeNull();
    });

    it('Dado super_admin com fator, Quando entrar com a senha, Então com fator, o login pede o código e não emite sessão', async () => {
      await enrollFactor();
      const { status, body, cookie } = await login();

      expect(status).toBe(200);
      expect(body.data).toEqual({
        mfaRequired: true,
        pendingToken: expect.stringMatching(/^mfa\./),
      });
      expect(cookie).toBeNull();
      const db = await getDb();
      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.detail, 'mfa_required'));
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/mfa/verify com o código do autenticador', () => {
    it('Dado fator cadastrado, Quando enviar o código atual, Então o código correto emite a sessão de super_admin', async () => {
      const { secret } = await enrollFactor();
      const started = await login();
      const result = await verify({
        pendingToken: started.body.data.pendingToken,
        code: codeNow(secret),
      });

      expect(result.status).toBe(200);
      expect(result.body.data).toEqual({ ok: true });
      const session = sessionOf(result.cookie);
      expect(session?.role).toBe('super_admin');
      expect(session?.subject).toBe(EMAIL);
      expect(session?.clinicId).toBeNull();
      expect(session?.sessionVersion).toBe(await versionOf());
    });

    it('Dado um código já aceito, Quando enviá-lo de novo, Então o código reusado recebe 401', async () => {
      const { secret } = await enrollFactor();
      const code = codeNow(secret);
      const first = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code,
      });
      const second = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code,
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(401);
      expect(second.body.error).toBe('Código inválido');
      expect(second.cookie).toBeNull();
    });

    it('Dado código errado, Quando verificar, Então código errado recebe 401 sem cookie e fica na auditoria', async () => {
      const { secret } = await enrollFactor();
      const wrong = codeNow(secret) === '000000' ? '111111' : '000000';
      const result = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code: wrong,
      });

      expect(result.status).toBe(401);
      expect(result.body.error).toBe('Código inválido');
      expect(result.cookie).toBeNull();
      const db = await getDb();
      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.detail, 'mfa_invalid_code'));
      expect(events.at(-1)?.actorRole).toBe('super_admin');
    });

    it('Dado 5 tentativas no minuto, Quando tentar a 6ª com o código certo, Então o limite por conta responde 429', async () => {
      const { secret } = await enrollFactor();
      const pendingToken = (await login()).body.data.pendingToken;
      for (let i = 0; i < 5; i += 1) {
        const attempt = await verify({ pendingToken, code: '999999' });
        expect(attempt.status).toBe(401);
      }
      // Outro token pendente, mesma conta: o limite não é por token.
      const sixth = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code: codeNow(secret),
      });

      expect(sixth.status).toBe(429);
      expect(sixth.body.error).toBe('Muitas tentativas, aguarde um minuto');
      expect(sixth.cookie).toBeNull();
    });
  });

  describe('Token pendente e corpo da requisição', () => {
    it('Dado token pendente inválido por qualquer motivo, Quando verificar, Então responde 401 com a mensagem de expiração', async () => {
      const { secret } = await enrollFactor();
      const valid = (await login()).body.data.pendingToken;
      const [prefix, payload, signature] = valid.split('.');
      const code = codeNow(secret);
      const sv = await versionOf();
      const expired = createMfaPendingToken(
        AUTH_SECRET,
        { accountId: superAdmin.id, sessionVersion: sv, stage: 'verify' },
        clock - 5 * 60_000 - 1,
      );
      const stale = createMfaPendingToken(
        AUTH_SECRET,
        { accountId: superAdmin.id, sessionVersion: sv - 1, stage: 'verify' },
        clock,
      );
      const enrollStage = createMfaPendingToken(
        AUTH_SECRET,
        { accountId: superAdmin.id, sessionVersion: sv, stage: 'enroll' },
        clock,
      );
      const confirmStage = createMfaPendingToken(
        AUTH_SECRET,
        {
          accountId: superAdmin.id,
          sessionVersion: sv,
          stage: 'confirm',
          encryptedSecret: 'x',
        },
        clock,
      );
      const cases: Array<[string, Record<string, unknown>]> = [
        ['ausente', { code }],
        [
          'adulterado',
          { pendingToken: `${prefix}.${payload}x.${signature}`, code },
        ],
        ['expirado', { pendingToken: expired, code }],
        ['etapa errada', { pendingToken: enrollStage, code }],
        [
          'recuperação com token de confirmação',
          { pendingToken: confirmStage, recoveryCode: 'aaaaa-aaaaa' },
        ],
        ['sv antigo', { pendingToken: stale, code }],
      ];
      for (const [reason, body] of cases) {
        const result = await verify(body);
        expect(result.status, reason).toBe(401);
        expect(result.body.error, reason).toBe(EXPIRED);
      }

      const db = await getDb();
      await db
        .update(userAccounts)
        .set({ active: false })
        .where(eq(userAccounts.id, superAdmin.id));
      const inactive = await verify({ pendingToken: valid, code });
      await db
        .update(userAccounts)
        .set({ active: true })
        .where(eq(userAccounts.id, superAdmin.id));
      expect(inactive.status).toBe(401);
      expect(inactive.body.error).toBe(EXPIRED);
    });

    it('Dado corpo sem código, com os dois ou código fora do formato, Quando verificar, Então valida o corpo com 400', async () => {
      const pendingToken = (await login()).body.data.pendingToken;
      const bodies = [
        { pendingToken },
        { pendingToken, code: '123456', recoveryCode: 'aaaaa-aaaaa' },
        { pendingToken, code: '12345' },
        { pendingToken, code: '12345a' },
        { pendingToken, code: 123456 },
      ];
      for (const body of bodies) {
        const result = await verify(body);
        expect(result.status).toBe(400);
        expect(result.body.error).toBe(
          'Informe o código de 6 dígitos ou um código de recuperação',
        );
      }
      const notJson = await verifyRoute.POST(
        new NextRequest('http://localhost/api/auth/mfa/verify', {
          method: 'POST',
          body: 'x',
        }),
      );
      expect(notJson.status).toBe(400);
    });

    it('Dado AUTH_SECRET ausente, Quando chamar as rotas de segundo fator, Então respondem 503', async () => {
      delete process.env.AUTH_SECRET;
      try {
        expect((await verify({ code: '123456' })).status).toBe(503);
        expect((await enroll('mfa.x.y')).status).toBe(503);
      } finally {
        process.env.AUTH_SECRET = AUTH_SECRET;
      }
    });
  });

  describe('POST /api/auth/mfa/enroll', () => {
    it('Dado token de cadastro, Quando pedir a chave, Então o cadastro devolve a chave, o link otpauth e nada é gravado', async () => {
      const result = await enroll((await login()).body.data.pendingToken);

      expect(result.status).toBe(200);
      expect(result.body.data.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(result.body.data.otpauthUri).toBe(
        `otpauth://totp/VittaFlow:dono%40vitta.test?secret=${result.body.data.secret}&issuer=VittaFlow&algorithm=SHA1&digits=6&period=30`,
      );
      expect(result.body.data.pendingToken).toMatch(/^mfa\./);
      const db = await getDb();
      expect(await db.select().from(userMfa)).toHaveLength(0);
    });

    it('Dado token de outra etapa, Quando pedir a chave, Então o cadastro só com token de cadastro (401)', async () => {
      const enrollToken = (await login()).body.data.pendingToken;
      const confirmToken = (await enroll(enrollToken)).body.data.pendingToken;
      await enrollFactor();
      const verifyToken = (await login()).body.data.pendingToken;
      const sv = await versionOf();
      const freshConfirm = createMfaPendingToken(
        AUTH_SECRET,
        {
          accountId: superAdmin.id,
          sessionVersion: sv,
          stage: 'confirm',
          encryptedSecret: 'x',
        },
        clock,
      );

      for (const token of [verifyToken, freshConfirm, confirmToken]) {
        const result = await enroll(token);
        expect(result.status).toBe(401);
        expect(result.body.error).toBe(EXPIRED);
      }
      expect((await enroll('')).status).toBe(401);
    });
  });

  describe('Confirmação do cadastro', () => {
    it('Dado a chave nova, Quando confirmar o cadastro com o código dela, Então devolve 10 códigos, emite a sessão e grava o fator cifrado', async () => {
      const started = await login();
      const enrolled = await enroll(started.body.data.pendingToken);
      const { secret } = enrolled.body.data;
      const before = await versionOf();
      const result = await verify<{ recoveryCodes: string[] }>({
        pendingToken: enrolled.body.data.pendingToken,
        code: codeNow(secret),
      });

      expect(result.status).toBe(200);
      expect(result.body.data.recoveryCodes).toHaveLength(10);
      expect(sessionOf(result.cookie)?.sessionVersion).toBe(before + 1);
      const db = await getDb();
      const [factor] = await db.select().from(userMfa);
      expect(factor.accountId).toBe(superAdmin.id);
      expect(factor.totpSecret).not.toContain(secret);
      expect(factor.totpSecret).toMatch(/^v1\./);
      expect(factor.lastUsedStep).toBe(totpStep(clock));
      const codes = await db.select().from(mfaRecoveryCodes);
      expect(codes).toHaveLength(10);
      expect(codes.every((row) => row.codeHash.startsWith('scrypt$'))).toBe(
        true,
      );
    });

    it('Dado o cadastro confirmado, Quando olhar o banco e reusar o token, Então os códigos exibidos uma única vez não voltam', async () => {
      const enrolled = await enroll((await login()).body.data.pendingToken);
      const body = {
        pendingToken: enrolled.body.data.pendingToken,
        code: codeNow(enrolled.body.data.secret),
      };
      const first = await verify<{ recoveryCodes: string[] }>(body);
      const db = await getDb();
      const stored = await db.select().from(mfaRecoveryCodes);
      for (const code of first.body.data.recoveryCodes) {
        expect(stored.some((row) => row.codeHash.includes(code))).toBe(false);
      }
      clock += 30_000;
      const replay = await verify({
        ...body,
        code: codeNow(enrolled.body.data.secret),
      });
      expect(replay.status).toBe(401);
      expect(replay.body.error).toBe(EXPIRED);
      expect(replay.cookie).toBeNull();
    });

    it('Dado código errado na confirmação, Quando verificar, Então a confirmação com código errado não grava nada', async () => {
      const enrolled = await enroll((await login()).body.data.pendingToken);
      const right = codeNow(enrolled.body.data.secret);
      const result = await verify({
        pendingToken: enrolled.body.data.pendingToken,
        code: right === '000000' ? '111111' : '000000',
      });

      expect(result.status).toBe(401);
      expect(result.body.error).toBe('Código inválido');
      const db = await getDb();
      expect(await db.select().from(userMfa)).toHaveLength(0);
      expect(await db.select().from(mfaRecoveryCodes)).toHaveLength(0);
    });

    it('Dado sessão e token pendente antigos, Quando confirmar o cadastro, Então confirmar revoga o que havia antes', async () => {
      const oldVerifyToken = createMfaPendingToken(
        AUTH_SECRET,
        {
          accountId: superAdmin.id,
          sessionVersion: await versionOf(),
          stage: 'enroll',
        },
        clock,
      );
      const before = await versionOf();
      await enrollFactor();

      expect(await versionOf()).toBe(before + 1);
      const result = await enroll(oldVerifyToken);
      expect(result.status).toBe(401);
    });
  });

  describe('Código de recuperação', () => {
    it('Dado um código de recuperação válido, Quando verificar, Então o código de recuperação leva ao recadastro sem sessão', async () => {
      const { recoveryCodes } = await enrollFactor();
      const result = await verify<PendingData>({
        pendingToken: (await login()).body.data.pendingToken,
        recoveryCode: recoveryCodes[3].toUpperCase(),
      });

      expect(result.status).toBe(200);
      expect(result.body.data).toEqual({
        mfaEnrollmentRequired: true,
        pendingToken: expect.stringMatching(/^mfa\./),
      });
      expect(result.cookie).toBeNull();
      const db = await getDb();
      const used = await db
        .select()
        .from(mfaRecoveryCodes)
        .where(sql`${mfaRecoveryCodes.usedAt} IS NOT NULL`);
      expect(used).toHaveLength(1);
      expect((await enroll(result.body.data.pendingToken)).status).toBe(200);
    });

    it('Dado código de recuperação usado ou inexistente, Quando verificar, Então o código de recuperação usado recebe 401', async () => {
      const { recoveryCodes } = await enrollFactor();
      const first = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        recoveryCode: recoveryCodes[0],
      });
      const again = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        recoveryCode: recoveryCodes[0],
      });
      const unknown = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        recoveryCode: 'zzzzz-zzzzz',
      });

      expect(first.status).toBe(200);
      for (const result of [again, unknown]) {
        expect(result.status).toBe(401);
        expect(result.body.error).toBe('Código de recuperação inválido');
      }
    });

    it('Dado recadastro após código de recuperação, Quando confirmar o novo, Então o recadastro troca fator e códigos', async () => {
      const old = await enrollFactor();
      const recovered = await verify<PendingData>({
        pendingToken: (await login()).body.data.pendingToken,
        recoveryCode: old.recoveryCodes[0],
      });
      const started = await enroll(recovered.body.data.pendingToken);

      // Recadastro abandonado: o fator antigo continua valendo.
      clock += 30_000;
      const stillOld = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code: codeNow(old.secret),
      });
      expect(stillOld.status).toBe(200);

      // O login acima não mexeu na session_version: o token de confirmação vale.
      const confirmed = await verify<{ recoveryCodes: string[] }>({
        pendingToken: started.body.data.pendingToken,
        code: codeNow(started.body.data.secret),
      });
      expect(confirmed.status).toBe(200);
      clock += 2 * 60_000;

      const oldCode = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code: codeNow(old.secret),
      });
      expect(oldCode.status).toBe(401);
      const oldRecovery = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        recoveryCode: old.recoveryCodes[1],
      });
      expect(oldRecovery.status).toBe(401);
      const newCode = await verify({
        pendingToken: (await login()).body.data.pendingToken,
        code: codeNow(started.body.data.secret),
      });
      expect(newCode.status).toBe(200);
      const db = await getDb();
      expect(await db.select().from(mfaRecoveryCodes)).toHaveLength(10);
    });

    it('Dado duas requisições simultâneas com o mesmo código, Quando verificar, Então a concorrência no código de recuperação deixa passar uma', async () => {
      const { recoveryCodes } = await enrollFactor();
      const [a, b] = await Promise.all([login(), login()]);
      const results = await Promise.all([
        verify({
          pendingToken: a.body.data.pendingToken,
          recoveryCode: recoveryCodes[5],
        }),
        verify({
          pendingToken: b.body.data.pendingToken,
          recoveryCode: recoveryCodes[5],
        }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });
  });

  it('Dado conta de outro papel, Quando entrar com a senha, Então recebe a sessão direto, sem segundo fator', async () => {
    const staff = UserAccount.create({
      email: 'equipe-mfa@clinica.com',
      passwordHash: await hashPassword(PASSWORD),
      role: 'company_admin',
      clinicId: CLINIC_A_ID,
    });
    await (await getRepositories(clinicScope(CLINIC_A_ID))).userAccounts.save(
      staff,
    );
    const result = await call<{ ok: true }>(
      loginRoute.POST,
      '/api/auth/login',
      {
        email: staff.email,
        password: PASSWORD,
      },
    );

    expect(result.body.data).toEqual({ ok: true });
    expect(sessionOf(result.cookie)?.role).toBe('company_admin');
  });
});
