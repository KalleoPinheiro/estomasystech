import { afterEach, describe, expect, it, vi } from 'vitest';
import { unwrapAction } from '@/lib/action-result';

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

  describe('sessão expirada', () => {
    const goTo = (_path: string) => {
      const assign = vi.fn();
      vi.stubGlobal('window', {
        location: { pathname: '/portal', search: '?a=1', hash: '', assign },
      });
      return assign;
    };
    afterEach(() => vi.unstubAllGlobals());

    it('Dado que o proxy redirecionou a ação ao login, Quando o Next recusa a resposta, Então leva ao login com a rota em next e a mensagem é de sessão expirada', async () => {
      const assign = goTo('/portal');

      await expect(
        unwrapAction(
          Promise.reject(
            new Error('An unexpected response was received from the server.'),
          ),
        ),
      ).rejects.toThrow('Sua sessão expirou. Entre novamente.');

      expect(assign).toHaveBeenCalledWith(
        '/login?error=session_expired&next=%2Fportal%3Fa%3D1',
      );
    });

    it('Dado a ação respondendo "Não autenticado", Quando desembrulha, Então também leva ao login', async () => {
      const assign = goTo('/portal');

      await expect(
        unwrapAction(
          Promise.resolve({
            success: false,
            data: null,
            error: 'Não autenticado',
          }),
        ),
      ).rejects.toThrow('Sua sessão expirou. Entre novamente.');

      expect(assign).toHaveBeenCalledTimes(1);
    });

    it('Dada uma falha de rede, Quando desembrulha, Então o erro segue como veio e não navega', async () => {
      const assign = goTo('/portal');

      await expect(
        unwrapAction(Promise.reject(new TypeError('Failed to fetch'))),
      ).rejects.toThrow('Failed to fetch');

      expect(assign).not.toHaveBeenCalled();
    });
  });
});
