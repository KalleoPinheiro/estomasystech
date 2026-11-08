// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoutButton } from '@/components/logout-button';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

describe('Feature: Botão de logout', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('Cenário: renderização', () => {
    it("Dado o componente, Quando renderizar, Então exibe o texto 'Sair'", () => {
      render(<LogoutButton />);

      expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    });

    it('Dado o componente, Então o botão vem do Button do Still Void', () => {
      render(<LogoutButton />);

      // SPEC_DEVIATION: na 3.x a variante ghost do <Button> do pacote emite a
      // classe semântica `sv-btn--ghost` em vez do utilitário Tailwind
      // `hover:bg-sv-surface` da 2.x — mesma mudança de implementação do
      // Dialog/Alert (ver tests/components/modal.test.tsx), não listada nas 3
      // quebras do Problem Statement da spec. Prova de origem segue a classe real.
      expect(screen.getByRole('button', { name: 'Sair' })).toHaveClass(
        'sv-btn--ghost',
      );
    });
  });

  describe('Cenário: clique aciona logout', () => {
    it('Dado clique no botão, Quando acionado, Então chama a API de logout', async () => {
      render(<LogoutButton />);

      fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/auth/logout', {
          method: 'POST',
        });
      });
    });

    it('Dado logout concluído, Quando acionado, Então redireciona para login e atualiza a rota', async () => {
      render(<LogoutButton />);

      fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

      await waitFor(() => {
        expect(push).toHaveBeenCalledWith('/login');
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    describe('Cenário: sessão expirada ou rede fora (#718)', () => {
      it('Dada resposta 401 do logout, Quando acionado, Então ainda redireciona para o login', async () => {
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue({ ok: false, status: 401 }),
        );
        render(<LogoutButton />);

        fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

        await waitFor(() => {
          expect(push).toHaveBeenCalledWith('/login');
        });
        expect(refresh).toHaveBeenCalledTimes(1);
      });

      it('Dado erro de rede no logout, Quando acionado, Então ainda redireciona para o login', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        render(<LogoutButton />);

        fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

        await waitFor(() => {
          expect(push).toHaveBeenCalledWith('/login');
        });
        expect(refresh).toHaveBeenCalledTimes(1);
      });
    });
  });
});
