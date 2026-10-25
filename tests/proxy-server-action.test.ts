import { NextRequest, type NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken } from '@/lib/auth/session';

vi.mock('@/lib/auth/staff-revocation', () => ({
  isSessionRevoked: vi.fn().mockResolvedValue(false),
}));

// O limite é contado no Postgres (issue #77) — PGlite na suíte.
process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const SECRET = 'segredo-do-proxy-em-teste';

/** O proxy lê os tetos na carga do módulo: cada teste importa do zero. */
async function loadProxy() {
  vi.resetModules();
  return (await import('@/proxy')).proxy;
}

const cookieFor = (subject: string): string =>
  `estomasystech_session=${createSessionToken(SECRET, Date.now() + 3_600_000, subject, 'atendente')}`;

const action = (
  path: string,
  { cookie, ip = '10.0.1.1' }: { cookie?: string; ip?: string } = {},
): NextRequest =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'next-action': 'a1b2c3',
      'x-forwarded-for': ip,
      ...(cookie ? { cookie } : {}),
    },
  });

const isNext = (response: NextResponse): boolean =>
  response.headers.get('x-middleware-next') === '1';

describe('Feature: limite de requisições também para Server Action (ADR-069 § 2)', () => {
  const saved = {
    secret: process.env.AUTH_SECRET,
    api: process.env.API_RATE_LIMIT_MAX,
    action: process.env.ACTION_RATE_LIMIT_MAX,
  };

  beforeEach(async () => {
    const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
    const { rateLimitWindows } = await import(
      '@/infrastructure/persistence/drizzle/schema'
    );
    await (await getDb()).delete(rateLimitWindows);
    process.env.AUTH_SECRET = SECRET;
    delete process.env.API_RATE_LIMIT_MAX;
    delete process.env.ACTION_RATE_LIMIT_MAX;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const [key, value] of Object.entries({
      AUTH_SECRET: saved.secret,
      API_RATE_LIMIT_MAX: saved.api,
      ACTION_RATE_LIMIT_MAX: saved.action,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it('Dado o teto estourado pela mesma conta, Quando chega mais um POST de Server Action numa página, Então responde 429 antes de chegar à ação', async () => {
    process.env.ACTION_RATE_LIMIT_MAX = '2';
    const proxy = await loadProxy();
    const cookie = cookieFor('recepcao@clinica.com');

    expect(isNext(await proxy(action('/mais', { cookie })))).toBe(true);
    expect(isNext(await proxy(action('/mais', { cookie })))).toBe(true);
    const blocked = await proxy(action('/mais', { cookie }));

    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toMatch(
      /Limite de requisições/,
    );
  });

  it('Dado o teto padrão (120), Quando uma conta faz 121 POSTs de ação, Então só o último recebe 429', async () => {
    const proxy = await loadProxy();
    const cookie = cookieFor('recepcao@clinica.com');

    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) {
      statuses.push((await proxy(action('/agenda', { cookie }))).status);
    }

    expect(statuses.slice(0, 120).every((status) => status !== 429)).toBe(true);
    expect(statuses[120]).toBe(429);
  });

  it('Dado o balde de ações cheio, Quando a mesma conta chama /api, Então a API não é afetada (contadores separados)', async () => {
    process.env.ACTION_RATE_LIMIT_MAX = '1';
    const proxy = await loadProxy();
    const cookie = cookieFor('recepcao@clinica.com');

    await proxy(action('/mais', { cookie }));
    expect((await proxy(action('/mais', { cookie }))).status).toBe(429);
    const api = await proxy(
      new NextRequest('http://localhost/api/appointments', {
        headers: { cookie, 'x-forwarded-for': '10.0.1.1' },
      }),
    );

    expect(isNext(api)).toBe(true);
  });

  it('Dado outra conta no mesmo IP, Quando a primeira estourou o teto, Então a segunda não é afetada', async () => {
    process.env.ACTION_RATE_LIMIT_MAX = '1';
    const proxy = await loadProxy();

    await proxy(action('/mais', { cookie: cookieFor('a@clinica.com') }));
    expect(
      (await proxy(action('/mais', { cookie: cookieFor('a@clinica.com') })))
        .status,
    ).toBe(429);
    expect(
      isNext(
        await proxy(action('/mais', { cookie: cookieFor('b@clinica.com') })),
      ),
    ).toBe(true);
  });

  it('Dado o teto estourado, Quando a navegação é um GET comum na página, Então não é limitada', async () => {
    process.env.ACTION_RATE_LIMIT_MAX = '1';
    const proxy = await loadProxy();
    const cookie = cookieFor('recepcao@clinica.com');

    await proxy(action('/mais', { cookie }));
    await proxy(action('/mais', { cookie }));
    const page = await proxy(
      new NextRequest('http://localhost/mais', {
        headers: { cookie, 'x-forwarded-for': '10.0.1.1' },
      }),
    );

    expect(isNext(page)).toBe(true);
  });

  it('Dado POST de ação sem sessão, Quando chega ao proxy, Então vai ao login (a guarda de sessão continua valendo)', async () => {
    const proxy = await loadProxy();

    const response = await proxy(action('/mais'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });
});
