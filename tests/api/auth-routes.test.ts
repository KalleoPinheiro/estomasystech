import { NextRequest } from 'next/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clinicScope, systemScope } from '@/lib/auth/tenant-scope';
import { buildUserAccount } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const jsonRequest = (
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Rotas de autenticação (login, logout, provedores)', () => {
  let loginRoute: typeof import('@/app/api/auth/login/route');
  let logoutRoute: typeof import('@/app/api/auth/logout/route');
  let providersRoute: typeof import('@/app/api/auth/providers/route');

  const originalEnv = { ...process.env };

  const resetAuthEnv = () => {
    delete process.env.AUTH_SECRET;
  };

  beforeAll(async () => {
    loginRoute = await import('@/app/api/auth/login/route');
    logoutRoute = await import('@/app/api/auth/logout/route');
    providersRoute = await import('@/app/api/auth/providers/route');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('Dado AUTH_SECRET ausente, Quando POST login, Então retorna 503', async () => {
      resetAuthEnv();
      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { email: 'alguem@clinica.com', password: 'qualquer' },
          { 'x-forwarded-for': '10.0.0.1' },
        ),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(503);
      expect(body.error).toContain('Autenticação não configurada');
    });

    it("Dado requisição sem x-forwarded-for, Quando POST login, Então usa IP 'unknown' e responde normalmente", async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const response = await loginRoute.POST(
        jsonRequest('/api/auth/login', 'POST', {
          email: 'ninguem@clinica.com',
          password: 'senha-errada',
        }),
      );

      expect(response.status).toBe(401);
    });

    it('Dado uma requisição sem email, Quando POST login, Então retorna 401 e nenhum cookie de sessão', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 'qualquer-senha' },
          {
            'x-forwarded-for': '10.0.0.3',
          },
        ),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(401);
      expect(body.error).toContain('Credenciais inválidas');
      expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('Dado uma senha que era a mestre e nenhum email, Quando POST login, Então continua 401 (senha mestre não existe mais)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';
      process.env.AUTH_PASSWORD_LEGADO = 'senha-correta'; // gitleaks:allow — fixture de teste, não é credencial

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 'senha-correta' },
          {
            'x-forwarded-for': '10.0.0.4',
          },
        ),
      );

      expect(response.status).toBe(401);
      delete process.env.AUTH_PASSWORD_LEGADO;
    });

    it('Dado conta individual inexistente, Quando POST login com email, Então retorna 401', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 'abc123', email: 'fulano@clinica.com' },
          { 'x-forwarded-for': '10.0.0.5' },
        ),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(401);
      expect(body.error).toContain('Email ou senha incorretos');
    });

    it('Dado conta individual ativa com senha correta, Quando POST login com email, Então cria sessão', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { userAccounts } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      await userAccounts.save(
        buildUserAccount({
          email: 'equipe@clinica.com',
          passwordHash: await hashPassword('s3nh@individual'),
          // 2FA opcional e não cadastrado: a senha basta (#291).
          role: 'atendente',
        }),
      );

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 's3nh@individual', email: 'equipe@clinica.com' },
          { 'x-forwarded-for': '10.0.0.6' },
        ),
      );
      const body = (await response.json()) as Envelope<{ ok: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.ok).toBe(true);
    });

    it('Dado conta com papel profissional, Quando POST login com email, Então sessão usa o papel e a empresa da própria conta (fix RBAC-02/RBAC-04)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-role-fix';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { verifySessionToken } = await import('@/lib/auth/session');
      const { userAccounts } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      await userAccounts.save(
        buildUserAccount({
          email: 'profissional@clinica.com',
          passwordHash: await hashPassword('s3nh@profissional'),
          role: 'profissional',
        }),
      );

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 's3nh@profissional', email: 'profissional@clinica.com' },
          { 'x-forwarded-for': '10.0.0.60' },
        ),
      );
      const cookie = response.headers.get('set-cookie') ?? '';
      const token = cookie.match(/estomasystech_session=([^;]+)/)?.[1] ?? '';

      const session = verifySessionToken('test-secret-role-fix', token);
      expect(session?.role).toBe('profissional');
      expect(session?.role).not.toBe('admin');
      expect(session?.clinicId).toBe('legacy-clinic');
    });

    it('Dado body inválido (sem password), Quando POST login, Então retorna 401', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          {},
          { 'x-forwarded-for': '10.0.0.7' },
        ),
      );

      expect(response.status).toBe(401);
    });

    it('Dado múltiplas tentativas seguidas do mesmo IP, Quando excede o limite, Então retorna 429', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';
      const ip = '10.0.0.100';

      let lastStatus = 0;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await loginRoute.POST(
          jsonRequest(
            '/api/auth/login',
            'POST',
            { password: 'errada' },
            {
              'x-forwarded-for': ip,
            },
          ),
        );
        lastStatus = response.status;
      }

      expect(lastStatus).toBe(429);
    });

    it('Dado login válido, Quando POST login, Então registra evento de auditoria com ator e empresa da conta (#71)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-audit-ok';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { userAccounts, auditEvents } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      await userAccounts.save(
        buildUserAccount({
          email: 'auditoria-ok@clinica.com',
          passwordHash: await hashPassword('s3nh@auditoria'),
        }),
      );

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 's3nh@auditoria', email: 'auditoria-ok@clinica.com' },
          { 'x-forwarded-for': '10.0.0.61' },
        ),
      );

      expect(response.status).toBe(200);
      const events = await auditEvents.findAll();
      const loginEvent = events.find(
        (event) =>
          event.resourceType === 'session' &&
          event.actorId === 'auditoria-ok@clinica.com',
      );
      expect(loginEvent).toBeDefined();
      expect(loginEvent?.action).toBe('read');
      expect(loginEvent?.actorRole).toBe('company_admin');
      expect(loginEvent?.clinicId).toBe('legacy-clinic');
    });

    it('Dado senha errada para conta existente, Quando POST login, Então registra evento de falha com detail invalid_credentials (#71)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-audit-fail';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { userAccounts } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      const { auditEvents } = await getRepositories(systemScope());
      await userAccounts.save(
        buildUserAccount({
          email: 'auditoria-falha-senha@clinica.com',
          passwordHash: await hashPassword('s3nh@correta'),
        }),
      );

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          {
            password: 'senha-errada',
            email: 'auditoria-falha-senha@clinica.com',
          },
          { 'x-forwarded-for': '10.0.0.62' },
        ),
      );

      expect(response.status).toBe(401);
      const events = await auditEvents.findAll();
      const failEvent = events.find(
        (event) =>
          event.resourceType === 'session' &&
          event.actorId === 'auditoria-falha-senha@clinica.com',
      );
      expect(failEvent).toBeDefined();
      expect(failEvent?.detail).toBe('invalid_credentials');
      expect(failEvent?.actorRole).toBe('anonymous');
      expect(failEvent?.clinicId).toBeNull();
    });

    it('Dado conta inexistente, Quando POST login, Então registra evento de falha sem revelar se a conta existe além da resposta HTTP (#71)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-audit-inexistente';

      const { getRepositories } = await import('@/infrastructure/container');
      // Login falho é evento de plataforma (B6): só o escopo de sistema o vê.
      const { auditEvents } = await getRepositories(systemScope());

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          {
            password: 'qualquer-senha',
            email: 'nao-existe-auditoria@clinica.com',
          },
          { 'x-forwarded-for': '10.0.0.63' },
        ),
      );

      expect(response.status).toBe(401);
      const events = await auditEvents.findAll();
      const failEvent = events.find(
        (event) =>
          event.resourceType === 'session' &&
          event.actorId === 'nao-existe-auditoria@clinica.com',
      );
      expect(failEvent).toBeDefined();
      expect(failEvent?.detail).toBe('invalid_credentials');
      expect(failEvent?.actorRole).toBe('anonymous');
      expect(failEvent?.clinicId).toBeNull();
    });

    it('Dado bloqueio por rate limit (429), Quando POST login, Então não registra evento de auditoria adicional (edge case)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-audit-rate-limit';
      const ip = '10.0.0.101';
      const { getRepositories } = await import('@/infrastructure/container');
      // Login falho é evento de plataforma (B6): só o escopo de sistema o vê.
      const { auditEvents } = await getRepositories(systemScope());

      const responses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await loginRoute.POST(
          jsonRequest(
            '/api/auth/login',
            'POST',
            {
              password: 'errada',
              email: `rate-limit-audit-${attempt}@clinica.com`,
            },
            { 'x-forwarded-for': ip },
          ),
        );
        responses.push(response.status);
      }
      expect(responses[5]).toBe(429);

      const events = await auditEvents.findAll();
      // As 5 primeiras tentativas (não bloqueadas) geram evento; a 6ª (429) não.
      const rateLimitEvents = events.filter((event) =>
        event.actorId.startsWith('rate-limit-audit-'),
      );
      expect(rateLimitEvents).toHaveLength(5);
    });

    it('Dado o mesmo e-mail em duas clínicas com senhas diferentes, Quando POST login com a senha da segunda conta, Então autentica a segunda conta, nunca a primeira (issue #125)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-email-duplicado';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { verifySessionToken } = await import('@/lib/auth/session');
      const email = 'duplicado@clinica.com';
      await ensureTestClinics();

      const clinicARepos = await getRepositories(clinicScope(CLINIC_A_ID));
      await clinicARepos.userAccounts.save(
        buildUserAccount({
          email,
          clinicId: CLINIC_A_ID,
          passwordHash: await hashPassword('senha-da-clinica-a'),
          role: 'atendente',
        }),
      );
      const clinicBRepos = await getRepositories(clinicScope(CLINIC_B_ID));
      await clinicBRepos.userAccounts.save(
        buildUserAccount({
          email,
          clinicId: CLINIC_B_ID,
          passwordHash: await hashPassword('senha-da-clinica-b'),
          role: 'atendente',
        }),
      );

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { email, password: 'senha-da-clinica-b' },
          { 'x-forwarded-for': '10.0.0.110' },
        ),
      );
      const cookie = response.headers.get('set-cookie') ?? '';
      const token = cookie.match(/estomasystech_session=([^;]+)/)?.[1] ?? '';
      const session = verifySessionToken('test-secret-email-duplicado', token);

      expect(response.status).toBe(200);
      expect(session?.clinicId).toBe(CLINIC_B_ID);
    });

    it('Dado o mesmo e-mail e a mesma senha em duas clínicas diferentes, Quando POST login, Então nega login (ambíguo) e registra auditoria com detail ambiguous_credentials (issue #125)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-email-ambiguo';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const email = 'ambiguo@clinica.com';
      const sharedHash = await hashPassword('senha-compartilhada');
      await ensureTestClinics();

      const clinicARepos = await getRepositories(clinicScope(CLINIC_A_ID));
      await clinicARepos.userAccounts.save(
        buildUserAccount({
          email,
          clinicId: CLINIC_A_ID,
          passwordHash: sharedHash,
        }),
      );
      const clinicBRepos = await getRepositories(clinicScope(CLINIC_B_ID));
      await clinicBRepos.userAccounts.save(
        buildUserAccount({
          email,
          clinicId: CLINIC_B_ID,
          passwordHash: sharedHash,
        }),
      );
      const { auditEvents } = await getRepositories(systemScope());

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { email, password: 'senha-compartilhada' },
          { 'x-forwarded-for': '10.0.0.111' },
        ),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(401);
      expect(body.error).toContain('Email ou senha incorretos');
      const events = await auditEvents.findAll();
      const ambiguousEvent = events.find(
        (event) => event.resourceType === 'session' && event.actorId === email,
      );
      expect(ambiguousEvent?.detail).toBe('ambiguous_credentials');
    });

    it('Dado o mesmo e-mail em duas clínicas mas uma conta inativa, Quando POST login com a senha da conta inativa, Então nega login (só a ativa entra na comparação)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-email-inativa';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const email = 'inativa@clinica.com';
      await ensureTestClinics();

      const clinicARepos = await getRepositories(clinicScope(CLINIC_A_ID));
      await clinicARepos.userAccounts.save(
        buildUserAccount({
          email,
          clinicId: CLINIC_A_ID,
          passwordHash: await hashPassword('senha-inativa'),
        }).deactivate(),
      );
      const clinicBRepos = await getRepositories(clinicScope(CLINIC_B_ID));
      await clinicBRepos.userAccounts.save(
        buildUserAccount({
          email,
          clinicId: CLINIC_B_ID,
          passwordHash: await hashPassword('senha-ativa'),
        }),
      );

      const response = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { email, password: 'senha-inativa' },
          { 'x-forwarded-for': '10.0.0.112' },
        ),
      );

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('Dado sessão ativa, Quando POST logout, Então limpa o cookie de sessão', async () => {
      const response = await logoutRoute.POST(
        jsonRequest('/api/auth/logout', 'POST', undefined, {
          'x-forwarded-for': '10.0.0.70',
        }),
      );
      const body = (await response.json()) as Envelope<{ ok: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.ok).toBe(true);
      const cookie = response.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('estomasystech_session=');
      expect(cookie).toMatch(/max-age=0/i);
    });

    it('Dado sessão válida, Quando POST logout, Então registra evento de auditoria com ator da sessão antes de limpar o cookie (#71)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-logout-audit';

      const { getRepositories } = await import('@/infrastructure/container');
      const { hashPassword } = await import('@/lib/auth/password');
      const { userAccounts, auditEvents } = await getRepositories(
        clinicScope('legacy-clinic'),
      );
      await userAccounts.save(
        buildUserAccount({
          email: 'logout-audit@clinica.com',
          passwordHash: await hashPassword('s3nh@logout'),
          role: 'atendente',
        }),
      );
      const loginResponse = await loginRoute.POST(
        jsonRequest(
          '/api/auth/login',
          'POST',
          { password: 's3nh@logout', email: 'logout-audit@clinica.com' },
          { 'x-forwarded-for': '10.0.0.71' },
        ),
      );
      const cookie = loginResponse.headers.get('set-cookie') ?? '';
      const sessionCookie =
        cookie.match(/estomasystech_session=[^;]+/)?.[0] ?? '';

      const response = await logoutRoute.POST(
        jsonRequest('/api/auth/logout', 'POST', undefined, {
          cookie: sessionCookie,
        }),
      );

      expect(response.status).toBe(200);
      const events = await auditEvents.findAll();
      const logoutEvent = events.find(
        (event) =>
          event.resourceType === 'session' &&
          event.actorId === 'logout-audit@clinica.com' &&
          event.action === 'delete',
      );
      expect(logoutEvent).toBeDefined();
      expect(logoutEvent?.actorRole).toBe('atendente');
    });

    it('Dado sem sessão (cookie ausente), Quando POST logout, Então não lança erro e apenas não audita (#71)', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-logout-sem-sessao';

      const response = await logoutRoute.POST(
        jsonRequest('/api/auth/logout', 'POST', undefined, {
          'x-forwarded-for': '10.0.0.72',
        }),
      );
      const body = (await response.json()) as Envelope<{ ok: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.ok).toBe(true);
    });
  });

  describe('GET /api/auth/providers', () => {
    it('Dado nenhuma configuração de auth, Quando GET providers, Então retorna senha desativada', async () => {
      resetAuthEnv();
      const response = await providersRoute.GET();
      const body = (await response.json()) as Envelope<{ password: boolean }>;

      expect(response.status).toBe(200);
      expect(body.data.password).toBe(false);
    });

    it('Dado AUTH_SECRET configurado, Quando GET providers, Então retorna senha ativa', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const response = await providersRoute.GET();
      const body = (await response.json()) as Envelope<{ password: boolean }>;

      expect(body.data.password).toBe(true);
      resetAuthEnv();
    });

    it('Dado AUTH_SECRET configurado e nenhuma variável do Google, Quando GET providers, Então a resposta não anuncia provedor Google', async () => {
      resetAuthEnv();
      process.env.AUTH_SECRET = 'test-secret-e2e';

      const response = await providersRoute.GET();
      const body = (await response.json()) as Envelope<Record<string, boolean>>;

      expect(Object.keys(body.data)).toEqual(['password']);
      resetAuthEnv();
    });
  });

  it('Ao final, restaura variáveis de ambiente originais', () => {
    process.env = { ...originalEnv };
    expect(true).toBe(true);
  });
});
