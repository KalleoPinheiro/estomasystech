// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from '@/app/esqueci-senha/page';

const jsonResponse = (
  success: boolean,
  data: unknown,
  error: string | null = null,
) => ({
  ok: success,
  json: async () => ({ success, data, error }),
});

/** AUTH-11: a tela pede o e-mail e confirma sem revelar se a conta existe. */
describe('Feature: Tela de esqueci minha senha', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('Dado um e-mail informado, Quando submeter, Então envia o e-mail para a rota de reset', async () => {
    let sentBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe('/api/auth/forgot-password');
        sentBody = JSON.parse(String(init?.body));
        return jsonResponse(true, { message: 'ok' });
      }),
    );

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'pessoa@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    await waitFor(() => expect(sentBody).toEqual({ email: 'pessoa@x.com' }));
  });

  it('Dado o envio concluído, Quando confirmar, Então mostra a mensagem neutra que não revela se a conta existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(true, { message: 'ok' })),
    );

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'pessoa@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(
      await screen.findByText(
        'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Enviar link' }),
    ).not.toBeInTheDocument();
  });

  it('Dado a rota responder erro, Quando submeter, Então exibe a mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          success: false,
          data: null,
          error: 'Muitas tentativas, aguarde um minuto',
        }),
      })),
    );

    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'pessoa@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(
      await screen.findByText('Muitas tentativas, aguarde um minuto'),
    ).toBeInTheDocument();
  });

  it('Dado a tela aberta, Quando renderizar, Então oferece o caminho de volta ao login', () => {
    render(<ForgotPasswordPage />);

    expect(
      screen.getByRole('link', { name: 'Voltar para o login' }),
    ).toHaveAttribute('href', '/login');
  });

  it('C2/#265 Dado a tela aberta, Quando renderizar, Então orienta pedir o link ao administrador da sua clínica, abaixo do formulário', () => {
    render(<ForgotPasswordPage />);

    const help = screen.getByText(
      'Não recebeu? Peça ao administrador da sua clínica um link de redefinição.',
    );
    const form = screen
      .getByRole('button', { name: 'Enviar link' })
      .closest('form') as HTMLElement;
    expect(
      form.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
