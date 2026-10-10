// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loginPath,
  redirectToLoginOnExpiredSession,
  safeNextPath,
} from '@/lib/login-redirect';

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('Feature: volta ao lugar depois do login (#207)', () => {
  describe('Cenário: next só aceita caminho interno', () => {
    it.each([
      ['/pacientes/p-1', '/pacientes/p-1'],
      ['/pacientes/p-1?aba=evolucoes', '/pacientes/p-1?aba=evolucoes'],
      ['/agenda#hoje', '/agenda#hoje'],
      ['/plataforma/../agenda', '/agenda'],
    ])('Dado %s, Então devolve %s', (raw, expected) => {
      expect(safeNextPath(raw)).toBe(expected);
    });

    it.each([
      [null],
      [undefined],
      [''],
      ['/'],
      ['https://evil.example/x'],
      ['evil.example'],
      ['//evil.example'],
      ['/\\evil.example'],
      ['/.//evil.example'],
      ['/\t/evil.example'],
      ['/\n/evil.example'],
      ['javascript:alert(1)'],
      ['/login'],
      ['/login/'],
      ['/definir-senha//'],
      ['/login?next=/agenda'],
      ['/definir-senha'],
      ['/esqueci-senha'],
    ])('Dado %j, Então descarta (null)', (raw) => {
      expect(safeNextPath(raw)).toBeNull();
    });
  });

  describe('Cenário: URL do login', () => {
    it('Dado motivo e next válido, Então monta /login com os dois', () => {
      expect(
        loginPath({ error: 'session_expired', next: '/pacientes/p-1?aba=x' }),
      ).toBe('/login?error=session_expired&next=%2Fpacientes%2Fp-1%3Faba%3Dx');
    });

    it('Dado next inválido e sem motivo, Então é só /login', () => {
      expect(loginPath({ next: '//evil.example' })).toBe('/login');
    });
  });

  describe('Cenário: sessão expirou numa chamada de API', () => {
    it('Dada uma tela autenticada, Então navega ao login com session_expired e a rota atual', () => {
      window.history.pushState({}, '', '/pacientes/p-1?aba=evolucoes');
      const navigate = vi.fn();

      expect(redirectToLoginOnExpiredSession(navigate)).toBe(true);
      expect(navigate).toHaveBeenCalledWith(
        '/login?error=session_expired&next=%2Fpacientes%2Fp-1%3Faba%3Devolucoes',
      );
    });

    it.each(['/login', '/login/', '/definir-senha', '/esqueci-senha'])(
      'Dada a tela sem sessão %s, Então não navega (401 é resposta do fluxo)',
      (path) => {
        window.history.pushState({}, '', path);
        const navigate = vi.fn();

        expect(redirectToLoginOnExpiredSession(navigate)).toBe(false);
        expect(navigate).not.toHaveBeenCalled();
      },
    );
  });
});
