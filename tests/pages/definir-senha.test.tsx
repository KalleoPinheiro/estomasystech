// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SetPasswordPage from '@/app/definir-senha/page';

const { searchParamsRef } = vi.hoisted(() => ({
  searchParamsRef: { current: new URLSearchParams('token=segredo-do-link') },
}));

// A página é Server Component: recebe `searchParams` do servidor (#554).
async function renderPage() {
  const ui = await SetPasswordPage({
    searchParams: Promise.resolve(Object.fromEntries(searchParamsRef.current)),
  });
  return render(ui);
}

const jsonResponse = (
  success: boolean,
  data: unknown,
  error: string | null = null,
) => ({
  ok: success,
  json: async () => ({ success, data, error }),
});

/**
 * AUTH-05 / AUTH-07: a tela envia o token do link com a senha escolhida,
 * confirma o sucesso e mostra a mensagem de erro vinda da API.
 */
describe('Feature: Tela de definição de senha', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    searchParamsRef.current = new URLSearchParams('token=segredo-do-link');
  });

  it('Dado o token na URL e senhas iguais, Quando submeter, Então envia token e senha para a API', async () => {
    let sentBody: unknown;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return jsonResponse(true, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderPage();
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Definir senha' }));

    await waitFor(() =>
      expect(sentBody).toEqual({
        token: 'segredo-do-link',
        password: 'senha-forte-1',
      }),
    );
  });

  it('Dado o envio bem-sucedido, Quando concluir, Então mostra a confirmação e o link para o login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(true, { ok: true })),
    );

    await renderPage();
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Definir senha' }));

    expect(
      await screen.findByText('Senha definida. Você já pode entrar.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ir para o login' }),
    ).toHaveAttribute('href', '/login');
  });

  it('Dado senhas diferentes, Quando submeter, Então mostra erro e não chama a API', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(true, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await renderPage();
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), {
      target: { value: 'senha-forte-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Definir senha' }));

    expect(
      await screen.findByText('As duas senhas não conferem'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado a API recusar o link, Quando submeter, Então exibe a mensagem de link inválido da API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          success: false,
          data: null,
          error: 'Link inválido ou expirado — solicite um novo',
        }),
      })),
    );

    await renderPage();
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.change(screen.getByLabelText('Confirme a senha'), {
      target: { value: 'senha-forte-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Definir senha' }));

    expect(
      await screen.findByText('Link inválido ou expirado — solicite um novo'),
    ).toBeInTheDocument();
  });

  it('Dado a URL sem token, Quando renderizar, Então avisa que o link está incompleto e oferece pedir outro', async () => {
    searchParamsRef.current = new URLSearchParams();

    await renderPage();

    expect(
      screen.getByText(
        'Link incompleto — abra o link exatamente como veio no e-mail.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Solicitar um novo link' }),
    ).toHaveAttribute('href', '/esqueci-senha');
  });
});
