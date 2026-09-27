import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_OAUTH_STATE_COOKIE,
  encodeCalendarOAuthState,
} from '@/lib/auth/google-calendar-oauth';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { cookieHeaderFor } from '../support/session';

/**
 * O cliente OAuth é interceptável para os casos de callback (a troca do `code`
 * é uma chamada HTTP real ao Google), mas por padrão delega para a
 * implementação verdadeira — os casos de início precisam da URL de
 * consentimento que o `googleapis` monta de fato.
 */
const { oauthClientMock, realClient } = vi.hoisted(() => ({
  oauthClientMock: vi.fn(),
  realClient: { create: null as null | ((config: unknown) => unknown) },
}));

vi.mock('@/lib/auth/google-oauth-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/auth/google-oauth-client')>();
  realClient.create = actual.createOAuthClient as (config: unknown) => unknown;
  return { createOAuthClient: oauthClientMock };
});

process.env.VITTA_DB_DRIVER = 'pglite';

const staffHeaders = (): Record<string, string> =>
  cookieHeaderFor('company_admin', 'agenda@clinica.com', CLINIC_A_ID);

const getRequest = (
  url: string,
  headers: Record<string, string> = staffHeaders(),
) => new NextRequest(`http://localhost${url}`, { method: 'GET', headers });

/**
 * Cookie de sessão + cookie de estado do OAuth na mesma requisição. O cookie de
 * estado carrega `<state>:<subject>` — o subject amarra o fluxo à conta que o
 * iniciou.
 */
const withState = (
  state: string,
  headers: Record<string, string> = staffHeaders(),
  subject = 'agenda@clinica.com',
) => ({
  ...headers,
  cookie: `${headers.cookie}; ${CALENDAR_OAUTH_STATE_COOKIE}=${encodeCalendarOAuthState(state, subject)}`,
});

/** Credencial gravada para o dono da sessão de teste (null quando não houve gravação). */
const storedCredential = async () => {
  const { getRepositories } = await import('@/infrastructure/container');
  const { googleAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
  return googleAccounts.findByEmail('agenda@clinica.com');
};

/** Zera a credencial para que "não persistiu" não passe por resíduo de outro caso. */
const clearCredential = async () => {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  const schema = await import('@/infrastructure/persistence/drizzle/schema');
  await (await getDb()).delete(schema.googleAccounts);
};

/**
 * AUTH-15..AUTH-19: conectar a agenda é uma integração iniciada por sessão
 * nativa; o fluxo nunca cria, renova ou troca sessão.
 */
describe('Feature: Conexão do Google Agenda desacoplada do login', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-abc';
    process.env.GOOGLE_CLIENT_SECRET = 'secret-xyz';
    process.env.APP_URL = 'https://app.vitta.test';
    oauthClientMock.mockImplementation((config: unknown) =>
      realClient.create?.(config),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Cenário: iniciar a conexão', () => {
    it('Dado sessão de equipe, Quando GET na rota de início, Então redireciona ao Google pedindo só o escopo de eventos com access_type offline', async () => {
      const route = await import(
        '@/app/api/integrations/google-calendar/route'
      );

      const response = await route.GET(
        getRequest('/api/integrations/google-calendar'),
      );

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.origin).toBe('https://accounts.google.com');
      expect(location.searchParams.get('scope')).toBe(
        'https://www.googleapis.com/auth/calendar.events',
      );
      expect(location.searchParams.get('access_type')).toBe('offline');
      expect(location.searchParams.get('redirect_uri')).toBe(
        'https://app.vitta.test/api/integrations/google-calendar/callback',
      );
    });

    it('Dado sessão de equipe, Quando GET na rota de início, Então grava o cookie de estado anti-CSRF', async () => {
      const route = await import(
        '@/app/api/integrations/google-calendar/route'
      );

      const response = await route.GET(
        getRequest('/api/integrations/google-calendar'),
      );

      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${CALENDAR_OAUTH_STATE_COOKIE}=`);
      const state = new URL(
        response.headers.get('location') ?? '',
      ).searchParams.get('state');
      // O cookie amarra o state à conta que iniciou o fluxo. O valor sai
      // percent-encoded pelo serializador de cookie, então compara decodificado.
      const cookieValue = decodeURIComponent(
        setCookie.match(
          new RegExp(`${CALENDAR_OAUTH_STATE_COOKIE}=([^;]+)`),
        )?.[1] ?? '',
      );
      expect(cookieValue).toBe(
        encodeCalendarOAuthState(state ?? '', 'agenda@clinica.com'),
      );
    });

    it('Dado nenhuma sessão, Quando GET na rota de início, Então responde 401 e não redireciona', async () => {
      const route = await import(
        '@/app/api/integrations/google-calendar/route'
      );

      const response = await route.GET(
        new NextRequest('http://localhost/api/integrations/google-calendar', {
          method: 'GET',
        }),
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('location')).toBeNull();
    });

    it('Dado credenciais do Google ausentes, Quando GET na rota de início, Então responde 503', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const route = await import(
        '@/app/api/integrations/google-calendar/route'
      );

      const response = await route.GET(
        getRequest('/api/integrations/google-calendar'),
      );

      expect(response.status).toBe(503);
    });
  });

  describe('Cenário: concluir a conexão', () => {
    const callbackRoute = async () =>
      import('@/app/api/integrations/google-calendar/callback/route');

    /**
     * O cliente OAuth real faria uma chamada HTTP ao Google; só o contrato
     * importa aqui (trocar o `code` por um refresh token).
     */
    const stubTokenExchange = (tokens: { refresh_token?: string | null }) => {
      oauthClientMock.mockReturnValue({ getToken: async () => ({ tokens }) });
    };

    it('Dado state conferindo e refresh token, Quando GET no callback, Então persiste a credencial cifrada sob o subject da sessão', async () => {
      await ensureTestClinics();
      stubTokenExchange({ refresh_token: 'refresh-token-real' });
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-1',
          withState('estado-1'),
        ),
      );

      expect(response.status).toBe(307);
      const { getRepositories } = await import('@/infrastructure/container');
      const { googleAccounts } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      const stored = await googleAccounts.findByEmail('agenda@clinica.com');
      expect(stored).not.toBeNull();
      expect(stored?.encryptedRefreshToken).not.toContain('refresh-token-real');
      // Chave de dados (#195), não o AUTH_SECRET: formato v1 com a chave atual.
      const { currentDataCipher } = await import('@/infrastructure/container');
      expect(
        currentDataCipher().isCurrent(stored?.encryptedRefreshToken ?? ''),
      ).toBe(true);
    });

    it('Dado a conexão concluída, Quando ler a resposta, Então nenhum cookie de sessão é emitido', async () => {
      await ensureTestClinics();
      stubTokenExchange({ refresh_token: 'outro-refresh' });
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-2',
          withState('estado-2'),
        ),
      );

      expect(response.headers.get('set-cookie') ?? '').not.toContain(
        `${SESSION_COOKIE}=`,
      );
    });

    it('Dado state divergente do cookie, Quando GET no callback, Então redireciona pra configurações com reason=fluxo_invalido e não persiste credencial (#124)', async () => {
      await ensureTestClinics();
      await clearCredential();
      stubTokenExchange({ refresh_token: 'nao-deve-salvar' });
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-forjado',
          withState('estado-real'),
        ),
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(307);
      expect(location.pathname).toBe('/configuracoes');
      expect(location.searchParams.get('calendar')).toBe('erro');
      expect(location.searchParams.get('reason')).toBe('fluxo_invalido');
      expect(await storedCredential()).toBeNull();
    });

    it('Dado state ausente na query, Quando GET no callback, Então redireciona com reason=fluxo_invalido e não persiste credencial (#124)', async () => {
      await ensureTestClinics();
      await clearCredential();
      stubTokenExchange({ refresh_token: 'nao-deve-salvar' });
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc',
          withState('estado-3'),
        ),
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(307);
      expect(location.searchParams.get('reason')).toBe('fluxo_invalido');
      expect(await storedCredential()).toBeNull();
    });

    it('Dado o Google não devolver refresh token, Quando GET no callback, Então redireciona com reason=sem_credencial e não persiste credencial (#124)', async () => {
      await ensureTestClinics();
      await clearCredential();
      stubTokenExchange({ refresh_token: null });
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-4',
          withState('estado-4'),
        ),
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(307);
      expect(location.searchParams.get('calendar')).toBe('erro');
      expect(location.searchParams.get('reason')).toBe('sem_credencial');
      expect(await storedCredential()).toBeNull();
    });

    it('Dado falha na troca do code, Quando GET no callback, Então redireciona com reason=falha_conexao (#124)', async () => {
      await ensureTestClinics();
      oauthClientMock.mockReturnValue({
        getToken: async () => {
          throw new Error('invalid_grant');
        },
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-5',
          withState('estado-5'),
        ),
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(307);
      expect(location.searchParams.get('reason')).toBe('falha_conexao');
    });

    it('Dado config do Google ausente, Quando GET no callback, Então redireciona com reason=nao_configurado (#124)', async () => {
      await ensureTestClinics();
      delete process.env.GOOGLE_CLIENT_ID;
      const route = await callbackRoute();

      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-6b',
          withState('estado-6b'),
        ),
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(307);
      expect(location.searchParams.get('reason')).toBe('nao_configurado');
    });

    it('Dado o fluxo iniciado pela sessão A e o callback chegando na sessão B, Quando GET no callback, Então recusa e não grava a credencial sob B', async () => {
      await ensureTestClinics();
      await clearCredential();
      stubTokenExchange({ refresh_token: 'nao-deve-salvar' });
      const route = await callbackRoute();

      // Cookie de estado emitido para "agenda@clinica.com" (sessão A), mas a
      // requisição de retorno chega autenticada como outra conta (sessão B).
      const sessionB = cookieHeaderFor(
        'company_admin',
        'outra-conta@clinica.com',
        CLINIC_A_ID,
      );
      const response = await route.GET(
        getRequest(
          '/api/integrations/google-calendar/callback?code=abc&state=estado-6',
          withState('estado-6', sessionB, 'agenda@clinica.com'),
        ),
      );

      expect(response.status).toBe(307);
      expect(
        new URL(response.headers.get('location') ?? '').searchParams.get(
          'reason',
        ),
      ).toBe('fluxo_invalido');
      const { getRepositories } = await import('@/infrastructure/container');
      const { googleAccounts } = await getRepositories(
        clinicScope(CLINIC_A_ID),
      );
      expect(
        await googleAccounts.findByEmail('outra-conta@clinica.com'),
      ).toBeNull();
      expect(await googleAccounts.findByEmail('agenda@clinica.com')).toBeNull();
    });

    it('Dado nenhuma sessão, Quando GET no callback, Então responde 401', async () => {
      const route = await callbackRoute();

      const response = await route.GET(
        new NextRequest(
          'http://localhost/api/integrations/google-calendar/callback?code=abc&state=x',
          { method: 'GET' },
        ),
      );

      expect(response.status).toBe(401);
    });
  });
});
