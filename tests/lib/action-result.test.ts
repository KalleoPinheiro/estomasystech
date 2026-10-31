import { afterEach, describe, expect, it, vi } from 'vitest';
import { unwrapAction } from '@/lib/action-result';
import { ApiError } from '@/lib/client';
import { SESSION_EXPIRED_MESSAGE } from '@/lib/login-redirect';

describe('Feature: desembrulhar o envelope da Server Action (#551)', () => {
  it('Dado um sucesso, Quando desembrulha, Então devolve o dado', async () => {
    await expect(
      unwrapAction(Promise.resolve({ success: true, data: 7, error: null })),
    ).resolves.toBe(7);
  });

  it('Dada uma falha, Quando desembrulha, Então lança a mensagem do servidor para o formulário mostrar', async () => {
    await expect(
      unwrapAction(
        Promise.resolve({
          success: false,
          data: null,
          error: 'Horário indisponível',
        }),
      ),
    ).rejects.toThrow('Horário indisponível');
  });

  describe('Scenario: sessão expirada em uma ação (#207, #552)', () => {
    const expired = {
      success: false as const,
      data: null,
      error: 'Não autenticado',
    };

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('Dada a ação sem sessão numa tela logada, Quando desembrulha, Então vai ao login e lança o 401 que guarda o rascunho', async () => {
      const assign = vi.fn();
      vi.stubGlobal('window', {
        location: {
          pathname: '/pacientes/p-1',
          search: '?aba=anamnese',
          hash: '',
          assign,
        },
      });

      const error = await unwrapAction(Promise.resolve(expired)).catch(
        (e) => e,
      );

      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 401,
        message: SESSION_EXPIRED_MESSAGE,
      });
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining('session_expired'),
      );
    });

    it('Dada a ação sem sessão fora do navegador, Quando desembrulha, Então lança a mensagem do servidor', async () => {
      await expect(unwrapAction(Promise.resolve(expired))).rejects.toThrow(
        'Não autenticado',
      );
    });
  });
});
