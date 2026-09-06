import { NextRequest, type NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, type UserRole } from '@/lib/auth/session';

/**
 * Revogação de conta desativada tem teste próprio (proxy-revocation) e exige
 * banco — aqui fica neutra para os cenários de política da borda.
 */
vi.mock('@/lib/auth/staff-revocation', () => ({
  isStaffSessionRevoked: vi.fn().mockResolvedValue(false),
}));

const SECRET = 'segredo-do-proxy-em-teste';

const AUTH_ENV_KEYS = [
  'AUTH_SECRET',
  'AUTH_PASSWORD',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APP_URL',
  'GOOGLE_ALLOWED_EMAILS',
  'API_RATE_LIMIT_MAX',
  'VITTA_ALLOW_OPEN_MODE',
] as const;

/**
 * O proxy lê API_RATE_LIMIT_MAX na carga do módulo e mantém o estado do rate
 * limiter em memória — cada teste importa o módulo do zero para não herdar
 * contagem nem limite de outro cenário.
 */
async function loadProxy() {
  vi.resetModules();
  const { resetAuthModeWarning } = await import('@/lib/auth/access-policy');
  resetAuthModeWarning();
  return (await import('@/proxy')).proxy;
}

const request = (path: string, cookie?: string, ip = '10.0.0.1'): NextRequest =>
  new NextRequest(`http://localhost${path}`, {
    headers: {
      'x-forwarded-for': ip,
      ...(cookie ? { cookie } : {}),
    },
  });

const sessionCookie = (role: UserRole, subject = 'maria@clinica.com'): string =>
  `vitta_session=${createSessionToken(SECRET, Date.now() + 3_600_000, subject, role)}`;

const isNext = (response: NextResponse): boolean =>
  response.headers.get('x-middleware-next') === '1';

const body = async (response: NextResponse) =>
  (await response.json()) as { success: boolean; data: null; error: string };

describe('Feature: Proxy (camada 1 de autorização, antigo middleware)', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    process.env.AUTH_SECRET = SECRET;
    process.env.AUTH_PASSWORD = 'senha-mestra-de-teste';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Cenário: rate limit por IP nas rotas de API', () => {
    it('Dado o limite estourado no mesmo IP, Quando chama /api, Então responde 429', async () => {
      process.env.API_RATE_LIMIT_MAX = '2';
      const proxy = await loadProxy();
      const cookie = sessionCookie('company_admin');

      expect((await proxy(request('/api/patients', cookie))).status).not.toBe(
        429,
      );
      expect((await proxy(request('/api/patients', cookie))).status).not.toBe(
        429,
      );
      const blocked = await proxy(request('/api/patients', cookie));

      expect(blocked.status).toBe(429);
      expect((await body(blocked)).error).toMatch(/Limite de requisições/);
    });

    it('Dado outro IP, Quando o primeiro estourou o limite, Então não é afetado', async () => {
      process.env.API_RATE_LIMIT_MAX = '1';
      const proxy = await loadProxy();
      const cookie = sessionCookie('company_admin');

      await proxy(request('/api/patients', cookie, '10.0.0.1'));
      expect(
        (await proxy(request('/api/patients', cookie, '10.0.0.1'))).status,
      ).toBe(429);
      expect(
        isNext(await proxy(request('/api/patients', cookie, '10.0.0.2'))),
      ).toBe(true);
    });

    it('Dado o limite estourado, Quando a rota é de página, Então não aplica rate limit', async () => {
      process.env.API_RATE_LIMIT_MAX = '1';
      const proxy = await loadProxy();
      const cookie = sessionCookie('company_admin');

      await proxy(request('/api/patients', cookie));
      expect(isNext(await proxy(request('/agenda', cookie)))).toBe(true);
    });
  });

  describe('Cenário: caminhos públicos', () => {
    it.each(['/login', '/api/auth/login', '/api/reminders/run'])(
      'Dado %s sem sessão, Então passa direto',
      async (path) => {
        const proxy = await loadProxy();

        expect(isNext(await proxy(request(path)))).toBe(true);
      },
    );
  });

  describe('Cenário: autenticação não configurada', () => {
    it('Dado produção sem autenticação, Então responde 503 e não deixa passar', async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.AUTH_PASSWORD;
      vi.stubEnv('NODE_ENV', 'production');
      const proxy = await loadProxy();

      const response = await proxy(request('/api/patients'));

      expect(response.status).toBe(503);
      expect((await body(response)).error).toMatch(
        /Autenticação não configurada/,
      );
    });

    it('Dado desenvolvimento sem autenticação e sem o opt-in, Então responde 503 (fail-closed)', async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.AUTH_PASSWORD;
      vi.stubEnv('NODE_ENV', 'development');
      const proxy = await loadProxy();

      expect((await proxy(request('/api/patients'))).status).toBe(503);
      expect((await proxy(request('/agenda'))).status).toBe(503);
    });

    it('Dado VITTA_ALLOW_OPEN_MODE=true fora de produção, Então libera (modo aberto)', async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.AUTH_PASSWORD;
      vi.stubEnv('NODE_ENV', 'development');
      process.env.VITTA_ALLOW_OPEN_MODE = 'true';
      const proxy = await loadProxy();

      expect(isNext(await proxy(request('/api/patients')))).toBe(true);
    });
  });

  describe('Cenário: requisição sem sessão válida', () => {
    it('Dada rota de API sem cookie, Então responde 401 em JSON', async () => {
      const proxy = await loadProxy();

      const response = await proxy(request('/api/patients'));

      expect(response.status).toBe(401);
      expect((await body(response)).error).toBe('Não autenticado');
    });

    it('Dada rota de API com cookie assinado por outro segredo, Então responde 401', async () => {
      const proxy = await loadProxy();
      const forjado = `vitta_session=${createSessionToken('outro-segredo', Date.now() + 3_600_000)}`;

      expect((await proxy(request('/api/patients', forjado))).status).toBe(401);
    });

    it('Dada rota de API com sessão expirada, Então responde 401', async () => {
      const proxy = await loadProxy();
      const expirado = `vitta_session=${createSessionToken(SECRET, Date.now() - 1_000)}`;

      expect((await proxy(request('/api/patients', expirado))).status).toBe(
        401,
      );
    });

    it('Dada uma página sem cookie, Então redireciona para /login', async () => {
      const proxy = await loadProxy();

      const response = await proxy(request('/agenda'));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost/login');
    });
  });

  describe('Cenário: autorização por papel', () => {
    it('Dada sessão admin, Então acessa rota de equipe e portal', async () => {
      const proxy = await loadProxy();
      const cookie = sessionCookie('company_admin');

      expect(isNext(await proxy(request('/api/patients', cookie)))).toBe(true);
      expect(isNext(await proxy(request('/agenda', cookie)))).toBe(true);
      expect(isNext(await proxy(request('/api/portal/me', cookie)))).toBe(true);
    });

    it.each(['patient', 'partner'] as const)(
      'Dada sessão %s numa rota de API da equipe, Então responde 403',
      async (role) => {
        const proxy = await loadProxy();

        const response = await proxy(
          request('/api/patients', sessionCookie(role)),
        );

        expect(response.status).toBe(403);
        expect((await body(response)).error).toBe(
          'Acesso restrito à equipe da clínica',
        );
      },
    );

    it('Dada sessão de paciente numa página da equipe, Então redireciona para /portal', async () => {
      const proxy = await loadProxy();

      const response = await proxy(
        request('/agenda', sessionCookie('patient')),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost/portal');
    });

    it.each(['/portal', '/api/portal/patient', '/api/auth/logout'])(
      'Dada sessão de paciente em %s, Então passa',
      async (path) => {
        const proxy = await loadProxy();

        expect(
          isNext(await proxy(request(path, sessionCookie('patient')))),
        ).toBe(true);
      },
    );
  });

  describe('Cenário: CSP estrita com nonce (issue #76)', () => {
    it('Dada requisição autenticada, Quando passa pelo proxy, Então gera CSP com nonce único e sem unsafe-inline em script/style de elemento', async () => {
      const proxy = await loadProxy();
      const cookie = sessionCookie('company_admin');

      const first = await proxy(request('/agenda', cookie));
      const second = await proxy(request('/agenda', cookie));

      const cspFirst = first.headers.get('Content-Security-Policy');
      const cspSecond = second.headers.get('Content-Security-Policy');

      expect(cspFirst).toMatch(
        /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
      );
      expect(cspFirst).toMatch(/style-src-elem 'self' 'nonce-[^']+'/);
      expect(cspFirst).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(cspFirst).not.toMatch(/style-src-elem[^;]*unsafe-inline/);
      expect(cspFirst).not.toEqual(cspSecond);
    });

    it('Dada requisição, Quando passa pelo proxy, Então permite unsafe-inline só no atributo style (CSP-01: Radix seta style inline sem nonce)', async () => {
      const proxy = await loadProxy();
      const response = await proxy(
        request('/agenda', sessionCookie('company_admin')),
      );

      expect(response.headers.get('Content-Security-Policy')).toMatch(
        /style-src-attr 'unsafe-inline'/,
      );
    });

    it('Dado caminho público, Quando passa pelo proxy, Então também recebe CSP com nonce', async () => {
      const proxy = await loadProxy();

      const response = await proxy(request('/login'));

      expect(response.headers.get('Content-Security-Policy')).toMatch(/nonce-/);
    });
  });
});
