// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock('@/lib/login-redirect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/login-redirect')>()),
  redirectToLoginOnExpiredSession: redirectMock,
}));

import {
  ApiError,
  apiFetch,
  apiFetchPage,
  isSessionExpiredError,
  SERVICE_UNAVAILABLE_MESSAGE,
} from '@/lib/client';

const respond = (status: number, body: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );

const envelope = (data: unknown, error: string | null = null) =>
  JSON.stringify({ success: error === null, data, error });

beforeEach(() => {
  redirectMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: apiFetch (#207)', () => {
  describe('Cenário: sessão expirada', () => {
    it('Dado 401 numa tela autenticada, Quando chamar, Então vai ao login e lança ApiError 401 com a mensagem de sessão expirada', async () => {
      redirectMock.mockReturnValue(true);
      respond(401, envelope(null, 'Não autenticado'));

      const error = await apiFetch('/api/patients').catch((e: unknown) => e);

      expect(redirectMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect((error as ApiError).message).toBe(
        'Sua sessão expirou. Entre novamente.',
      );
      expect(isSessionExpiredError(error)).toBe(true);
    });

    it('Dado 401 na tela de login (senha errada), Quando chamar, Então mantém a mensagem do servidor', async () => {
      redirectMock.mockReturnValue(false);
      respond(401, envelope(null, 'Email ou senha incorretos'));

      await expect(apiFetch('/api/auth/login')).rejects.toMatchObject({
        status: 401,
        message: 'Email ou senha incorretos',
      });
    });

    it('Dado 401 numa listagem paginada, Quando chamar, Então também vai ao login', async () => {
      redirectMock.mockReturnValue(true);
      respond(401, envelope(null, 'Não autenticado'));

      await expect(apiFetchPage('/api/patients')).rejects.toMatchObject({
        status: 401,
      });
      expect(redirectMock).toHaveBeenCalledTimes(1);
    });

    it('Dado erro que não é 401, Então não vai ao login nem conta como sessão expirada', async () => {
      respond(403, envelope(null, 'Seu papel não tem acesso a este recurso'));

      const error = await apiFetch('/api/audit').catch((e: unknown) => e);

      expect(redirectMock).not.toHaveBeenCalled();
      expect(isSessionExpiredError(error)).toBe(false);
      expect(isSessionExpiredError(new Error('x'))).toBe(false);
    });
  });

  describe('Cenário: corpo que não é JSON', () => {
    it.each([
      [502, '<html><body>Bad Gateway</body></html>'],
      [504, '<html>Gateway Timeout</html>'],
      [413, 'Request Entity Too Large'],
      [200, ''],
    ])(
      'Dado %i com corpo não-JSON, Então lança mensagem amigável preservando o status',
      async (status, body) => {
        respond(status, body);

        await expect(apiFetch('/api/patients')).rejects.toMatchObject({
          name: 'ApiError',
          status,
          message: SERVICE_UNAVAILABLE_MESSAGE,
        });
      },
    );

    it('Dada listagem paginada com HTML, Então mesma mensagem amigável', async () => {
      respond(502, '<html>Bad Gateway</html>');

      await expect(apiFetchPage('/api/patients')).rejects.toMatchObject({
        status: 502,
        message: SERVICE_UNAVAILABLE_MESSAGE,
      });
    });
  });

  describe('Cenário: respostas JSON (comportamento preservado)', () => {
    it('Dado sucesso com data null, Então devolve null (#65)', async () => {
      respond(200, envelope(null));

      await expect(apiFetch('/api/patients/p/anamnesis')).resolves.toBeNull();
    });

    it('Dado erro JSON sem mensagem, Então "Erro desconhecido" com o status', async () => {
      respond(500, JSON.stringify({ success: false, data: null, error: null }));

      await expect(apiFetch('/api/x')).rejects.toMatchObject({
        status: 500,
        message: 'Erro desconhecido',
      });
    });

    it('Dada página com cursor, Então devolve itens e próximo cursor', async () => {
      respond(
        200,
        JSON.stringify({
          success: true,
          data: [{ id: '1' }],
          error: null,
          meta: { nextCursor: 'c2' },
        }),
      );

      await expect(apiFetchPage('/api/patients')).resolves.toEqual({
        items: [{ id: '1' }],
        nextCursor: 'c2',
      });
    });
  });
});
