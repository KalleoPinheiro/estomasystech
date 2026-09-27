import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOTSTRAP_TOKEN_HEADER,
  BOOTSTRAP_UNAVAILABLE_MESSAGE,
} from '@/app/api/auth/bootstrap/route';
import { systemScope } from '@/lib/auth/tenant-scope';
import { spyOnSentEmails, tokenFromLastEmail } from '../support/email';

process.env.VITTA_DB_DRIVER = 'pglite';
process.env.APP_URL = 'https://app.vitta.test';

const BOOTSTRAP_TOKEN = 'segredo-de-deploy-do-bootstrap'; // gitleaks:allow — fixture de teste, não é credencial

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

let ipCounter = 0;
const freshIp = (): string => {
  ipCounter += 1;
  return `10.5.0.${ipCounter}`;
};

const bootstrapRequest = (
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new NextRequest('http://localhost/api/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': freshIp(),
      ...headers,
    },
  });

const withToken = (token = BOOTSTRAP_TOKEN): Record<string, string> => ({
  [BOOTSTRAP_TOKEN_HEADER]: token,
});

/** Zera a instalação: bootstrap só existe enquanto não há nenhuma conta. */
const emptyInstallation = async (): Promise<void> => {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  const schema = await import('@/infrastructure/persistence/drizzle/schema');
  const db = await getDb();
  await db.delete(schema.authTokens);
  await db.delete(schema.mfaRecoveryCodes);
  await db.delete(schema.userMfa);
  await db.delete(schema.userAccounts);
};

/**
 * AUTH-27 / AUTH-28 / AUTH-29: instalação nova cria o primeiro Super Admin com
 * o segredo de deploy; depois disso, e sem o segredo, a rota é 403.
 */
describe('Feature: POST /api/auth/bootstrap (primeiro Super Admin)', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env.VITTA_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
    await emptyInstallation();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    // Em hook, não depois da asserção: um caso que falhe no meio não pode
    // deixar o `fetch` stubado vazar para o próximo.
    vi.unstubAllGlobals();
  });

  it('Dado uma instalação vazia e o segredo correto, Quando POST, Então cria a conta super_admin', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const emails = spyOnSentEmails();

    const response = await route.POST(
      bootstrapRequest({ email: 'fundador@clinica.com' }, withToken()),
    );
    const json = (await response.json()) as Envelope<{
      email: string;
      role: string;
      inviteUrl: string | null;
    }>;
    emails.restore();

    expect(response.status).toBe(200);
    expect(json.data.email).toBe('fundador@clinica.com');
    expect(json.data.role).toBe('super_admin');
  });

  it('Dado o gateway de e-mail desativado (dry-run), Quando POST, Então a resposta traz o link do convite', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const emails = spyOnSentEmails();

    const response = await route.POST(
      bootstrapRequest({ email: 'sem-canal@clinica.com' }, withToken()),
    );
    const json = (await response.json()) as Envelope<{
      inviteUrl: string | null;
    }>;
    emails.restore();

    expect(json.data.inviteUrl).toContain(
      'https://app.vitta.test/definir-senha?token=',
    );
  });

  it('Dado um canal de e-mail ativo, Quando POST, Então o link NÃO é devolvido na resposta', async () => {
    // Com credenciais presentes o container monta o gateway real (enabled), que
    // é o caminho de produção; o `fetch` é interceptado para não sair nada.
    process.env.RESEND_API_KEY = 're_fixture_de_teste'; // gitleaks:allow — fixture de teste, não é credencial
    process.env.EMAIL_FROM = 'clinica@vitta.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    );
    const route = await import('@/app/api/auth/bootstrap/route');

    const response = await route.POST(
      bootstrapRequest({ email: 'com-canal@clinica.com' }, withToken()),
    );
    const json = (await response.json()) as Envelope<{
      inviteUrl: string | null;
    }>;

    expect(json.data.inviteUrl).toBeNull();
  });

  it('Dado o bootstrap concluído, Quando conferir o e-mail, Então recebeu o convite para definir a senha', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const emails = spyOnSentEmails();

    await route.POST(
      bootstrapRequest({ email: 'convite-sa@clinica.com' }, withToken()),
    );

    expect(emails.bodies).toHaveLength(1);
    expect(emails.bodies[0]).toContain('convite-sa@clinica.com');
    expect(emails.bodies[0]).toContain(
      'https://app.vitta.test/definir-senha?token=',
    );
    emails.restore();
  });

  it('Dado o convite do bootstrap, Quando definir a senha e logar, Então o primeiro login exige cadastrar o segundo fator e só depois a sessão nasce super_admin (B2)', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const emails = spyOnSentEmails();
    await route.POST(
      bootstrapRequest({ email: 'sa-loga@clinica.com' }, withToken()),
    );
    const token = tokenFromLastEmail(emails);
    emails.restore();

    const setPassword = await import('@/app/api/auth/set-password/route');
    await setPassword.POST(
      new NextRequest('http://localhost/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: 'senha-do-fundador-1' }),
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': freshIp(),
        },
      }),
    );

    const login = await import('@/app/api/auth/login/route');
    const response = await login.POST(
      new NextRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'sa-loga@clinica.com',
          password: 'senha-do-fundador-1',
        }),
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': freshIp(),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    const pending = (await response.json()) as Envelope<{
      mfaEnrollmentRequired: boolean;
      pendingToken: string;
    }>;
    expect(pending.data.mfaEnrollmentRequired).toBe(true);

    const post = (url: string, body: unknown) =>
      new NextRequest(`http://localhost${url}`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    const enroll = await import('@/app/api/auth/mfa/enroll/route');
    const enrolled = (await (
      await enroll.POST(
        post('/api/auth/mfa/enroll', {
          pendingToken: pending.data.pendingToken,
        }),
      )
    ).json()) as Envelope<{ secret: string; pendingToken: string }>;
    const { totpCode, totpStep } = await import('@/domain/auth/totp');
    const verify = await import('@/app/api/auth/mfa/verify/route');
    const confirmed = await verify.POST(
      post('/api/auth/mfa/verify', {
        pendingToken: enrolled.data.pendingToken,
        code: totpCode(enrolled.data.secret, totpStep(Date.now())),
      }),
    );

    expect(confirmed.status).toBe(200);
    const { verifySessionToken } = await import('@/lib/auth/session');
    const cookie = confirmed.headers.get('set-cookie') ?? '';
    const value = cookie.split(';')[0].split('=')[1];
    expect(
      verifySessionToken(process.env.AUTH_SECRET as string, value)?.role,
    ).toBe('super_admin');
    const codes = (await confirmed.json()) as Envelope<{
      recoveryCodes: string[];
    }>;
    expect(codes.data.recoveryCodes).toHaveLength(10);
  });

  it('Dado que já existe uma conta, Quando POST de novo, Então responde 403 e não cria nada', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const emails = spyOnSentEmails();
    await route.POST(
      bootstrapRequest({ email: 'primeiro@clinica.com' }, withToken()),
    );

    const response = await route.POST(
      bootstrapRequest({ email: 'segundo@clinica.com' }, withToken()),
    );
    const json = (await response.json()) as Envelope<null>;
    emails.restore();

    expect(response.status).toBe(403);
    expect(json.error).toBe(BOOTSTRAP_UNAVAILABLE_MESSAGE);
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(systemScope());
    expect(await userAccounts.findByEmail('segundo@clinica.com')).toBeNull();
  });

  it('Dado uma instalação vazia, Quando dois POST concorrem com o segredo correto, Então só um cria a conta super_admin (issue #51)', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const emails = spyOnSentEmails();

    const [first, second] = await Promise.all([
      route.POST(
        bootstrapRequest({ email: 'concorrente-a@clinica.com' }, withToken()),
      ),
      route.POST(
        bootstrapRequest({ email: 'concorrente-b@clinica.com' }, withToken()),
      ),
    ]);
    emails.restore();

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 403]);

    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(systemScope());
    const [accountA, accountB] = await Promise.all([
      userAccounts.findByEmail('concorrente-a@clinica.com'),
      userAccounts.findByEmail('concorrente-b@clinica.com'),
    ]);
    expect(
      [accountA, accountB].filter((account) => account !== null),
    ).toHaveLength(1);
  });

  it('Dado o header do segredo ausente, Quando POST, Então responde 403 e não cria conta', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');

    const response = await route.POST(
      bootstrapRequest({ email: 'sem-header@clinica.com' }),
    );
    const json = (await response.json()) as Envelope<null>;

    expect(response.status).toBe(403);
    expect(json.error).toBe(BOOTSTRAP_UNAVAILABLE_MESSAGE);
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(systemScope());
    expect(await userAccounts.hasAnyAccount()).toBe(false);
  });

  it('Dado um segredo incorreto, Quando POST, Então responde 403 e não cria conta', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');

    const response = await route.POST(
      bootstrapRequest(
        { email: 'segredo-errado@clinica.com' },
        withToken('nao-e-o-segredo'),
      ),
    );

    expect(response.status).toBe(403);
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(systemScope());
    expect(await userAccounts.hasAnyAccount()).toBe(false);
  });

  it('Dado VITTA_BOOTSTRAP_TOKEN não configurado, Quando POST com qualquer header, Então responde 403', async () => {
    delete process.env.VITTA_BOOTSTRAP_TOKEN;
    const route = await import('@/app/api/auth/bootstrap/route');

    const response = await route.POST(
      bootstrapRequest({ email: 'sem-config@clinica.com' }, withToken()),
    );

    expect(response.status).toBe(403);
    const { getRepositories } = await import('@/infrastructure/container');
    const { userAccounts } = await getRepositories(systemScope());
    expect(await userAccounts.hasAnyAccount()).toBe(false);
  });

  it('Dado o envio do convite falhando, Quando POST, Então ainda responde 200 e devolve o link (senão a instalação fica sem primeiro acesso)', async () => {
    const { NullEmailGateway } = await import(
      '@/application/ports/email-gateway'
    );
    vi.spyOn(NullEmailGateway.prototype, 'send').mockRejectedValue(
      new Error('provedor fora'),
    );
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const route = await import('@/app/api/auth/bootstrap/route');

    const response = await route.POST(
      bootstrapRequest({ email: 'envio-falhou-sa@clinica.com' }, withToken()),
    );
    const json = (await response.json()) as Envelope<{
      inviteUrl: string | null;
    }>;

    expect(response.status).toBe(200);
    expect(json.data.inviteUrl).toContain(
      'https://app.vitta.test/definir-senha?token=',
    );
    expect(errors).toHaveBeenCalled();
  });

  it('Dado seis tentativas do mesmo IP em um minuto, Quando a sexta chegar, Então responde 429', async () => {
    const route = await import('@/app/api/auth/bootstrap/route');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const request = new NextRequest('http://localhost/api/auth/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ email: `forca-bruta-${i}@x.com` }),
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '10.7.7.7',
          ...withToken('token-errado'),
        },
      });
      statuses.push((await route.POST(request)).status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 403)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
