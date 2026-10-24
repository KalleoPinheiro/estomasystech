// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';

const { routerMock, searchParamsRef } = vi.hoisted(() => {
  return {
    routerMock: { push: vi.fn(), refresh: vi.fn() },
    searchParamsRef: { current: new URLSearchParams() },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParamsRef.current,
}));

function jsonResponse(
  success: boolean,
  data: unknown,
  error: string | null = null,
) {
  return {
    ok: success,
    json: async () => ({ success, data, error }),
  };
}

interface Providers {
  password: boolean;
}

function mockProviders(providers: Providers) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/auth/providers')) {
        return jsonResponse(true, providers);
      }
      throw new Error(`URL não mapeada no mock: ${url}`);
    }),
  );
}

const mockLogin = (loginResponse: ReturnType<typeof jsonResponse>) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/auth/providers')) {
        return jsonResponse(true, { password: true });
      }
      if (url.startsWith('/api/auth/login')) {
        return loginResponse;
      }
      throw new Error(`URL não mapeada no mock: ${url}`);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  searchParamsRef.current = new URLSearchParams();
  routerMock.push.mockClear();
  routerMock.refresh.mockClear();
});

/** AUTH-30: a tela oferece só e-mail + senha e o caminho de recuperação. */
describe('Feature: Página de login', () => {
  describe('Cenário: erro vindo de um redirecionamento', () => {
    it('Dado código de erro conhecido na URL, Quando renderizar, Então exibe a mensagem mapeada', async () => {
      searchParamsRef.current = new URLSearchParams('error=session_expired');
      mockProviders({ password: true });

      render(<LoginPage />);

      expect(
        await screen.findByText('Sua sessão expirou. Entre novamente.'),
      ).toBeInTheDocument();
    });

    // LOG-02 (#93): texto arbitrário da URL nunca é renderizado — vetor de
    // phishing por texto refletido, mesmo sem XSS (React escapa). Só valores
    // de um allowlist viram mensagem; qualquer outro cai na mensagem genérica.
    it('Dado código de erro desconhecido na URL, Quando renderizar, Então exibe mensagem genérica, nunca o texto bruto', async () => {
      searchParamsRef.current = new URLSearchParams(
        'error=<script>alert(1)</script>',
      );
      mockProviders({ password: true });

      render(<LoginPage />);

      expect(
        await screen.findByText(
          'Não foi possível concluir a operação. Tente novamente.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('<script>alert(1)</script>'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: autenticação não configurada', () => {
    it('Dado servidor sem AUTH_SECRET, Quando renderizar, Então exibe alerta de configuração ausente', async () => {
      mockProviders({ password: false });

      render(<LoginPage />);

      expect(
        await screen.findByText('Autenticação não configurada no servidor.'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: nenhum vestígio do login por Google', () => {
    it('Dado a tela carregada, Quando renderizar, Então não há botão nem link do Google', async () => {
      mockProviders({ password: true });

      render(<LoginPage />);

      await screen.findByLabelText('Senha');
      expect(screen.queryByText('Entrar com Google')).not.toBeInTheDocument();
      expect(
        screen.queryByText('entrar conectando o Google Agenda'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    it('Dado a tela carregada, Quando renderizar, Então o e-mail é obrigatório (não há mais senha da clínica)', async () => {
      mockProviders({ password: true });

      render(<LoginPage />);

      const email = (await screen.findByLabelText('Email')) as HTMLInputElement;
      expect(email.required).toBe(true);
    });
  });

  describe('Cenário: mostrar a senha', () => {
    it('Dado a senha oculta, Quando tocar em Mostrar senha, Então o campo vira texto e o botão passa a Ocultar senha', async () => {
      mockProviders({ password: true });

      render(<LoginPage />);

      const senha = (await screen.findByLabelText('Senha')) as HTMLInputElement;
      expect(senha.type).toBe('password');

      fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
      expect(senha.type).toBe('text');

      fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
      expect(senha.type).toBe('password');
    });
  });

  describe('Cenário: recuperação de senha', () => {
    it('Dado a tela de login, Quando renderizar, Então oferece o link para esqueci minha senha', async () => {
      mockProviders({ password: true });

      render(<LoginPage />);

      const link = await screen.findByRole('link', {
        name: 'Esqueci minha senha',
      });
      expect(link).toHaveAttribute('href', '/esqueci-senha');
    });
  });

  describe('Cenário: submissão do formulário', () => {
    it('Dado e-mail e senha preenchidos, Quando submeter, Então envia os dois e redireciona', async () => {
      const fetchMock = mockLogin(jsonResponse(true, { ok: true }));

      render(<LoginPage />);

      fireEvent.change(await screen.findByLabelText('Email'), {
        target: { value: 'ana@clinica.com' },
      });
      fireEvent.change(screen.getByLabelText('Senha'), {
        target: { value: 'senhaIndividual123' },
      });
      fireEvent.click(screen.getByText('Entrar'));

      await waitFor(() => {
        expect(routerMock.push).toHaveBeenCalledWith('/');
      });
      expect(routerMock.refresh).toHaveBeenCalledTimes(1);

      const loginCall = fetchMock.mock.calls.find(([input]) =>
        String(input).startsWith('/api/auth/login'),
      );
      const body = JSON.parse(String(loginCall?.[1]?.body ?? '{}'));
      expect(body).toEqual({
        email: 'ana@clinica.com',
        password: 'senhaIndividual123',
      }); // gitleaks:allow — fixture de teste, não é credencial
    });

    it('Dado credencial inválida, Quando submeter, Então exibe a mensagem de erro e reabilita o botão', async () => {
      mockLogin(jsonResponse(false, null, 'Email ou senha incorretos'));

      render(<LoginPage />);

      fireEvent.change(await screen.findByLabelText('Email'), {
        target: { value: 'ana@clinica.com' },
      });
      fireEvent.change(screen.getByLabelText('Senha'), {
        target: { value: 'senhaErrada' },
      });
      fireEvent.click(screen.getByText('Entrar'));

      expect(
        await screen.findByText('Email ou senha incorretos'),
      ).toBeInTheDocument();
      expect(routerMock.push).not.toHaveBeenCalled();
      const button = screen.getByText('Entrar') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });

  describe('Cenário: volta ao lugar com ?next= (#207)', () => {
    async function submitLogin() {
      fireEvent.change(await screen.findByLabelText('Email'), {
        target: { value: 'ana@clinica.com' },
      });
      fireEvent.change(screen.getByLabelText('Senha'), {
        target: { value: 'senhaIndividual123' },
      });
      fireEvent.click(screen.getByText('Entrar'));
    }

    it('Dado next interno e sessão expirada, Quando entrar, Então mostra o aviso e volta à ficha', async () => {
      searchParamsRef.current = new URLSearchParams(
        'error=session_expired&next=%2Fpacientes%2Fp-1%3Faba%3Devolucoes',
      );
      mockLogin(jsonResponse(true, { ok: true }));

      render(<LoginPage />);
      expect(
        await screen.findByText('Sua sessão expirou. Entre novamente.'),
      ).toBeInTheDocument();
      await submitLogin();

      await waitFor(() => {
        expect(routerMock.push).toHaveBeenCalledWith(
          '/pacientes/p-1?aba=evolucoes',
        );
      });
    });

    it.each(['https://evil.example', '//evil.example', '/\\evil.example'])(
      'Dado next externo %s, Quando entrar, Então ignora e vai a /',
      async (next) => {
        searchParamsRef.current = new URLSearchParams({ next });
        mockLogin(jsonResponse(true, { ok: true }));

        render(<LoginPage />);
        await submitLogin();

        await waitFor(() => {
          expect(routerMock.push).toHaveBeenCalledWith('/');
        });
      },
    );

    it('Dado 401 de senha errada na própria tela de login, Então mostra o erro do servidor e não sai da tela', async () => {
      window.history.pushState({}, '', '/login');
      const fetchMock = mockLogin({
        ...jsonResponse(false, null, 'Email ou senha incorretos'),
        status: 401,
      } as ReturnType<typeof jsonResponse>);

      render(<LoginPage />);
      await submitLogin();

      expect(
        await screen.findByText('Email ou senha incorretos'),
      ).toBeInTheDocument();
      // Se tivesse tratado como sessão expirada, a mensagem seria a de expiração.
      expect(
        screen.queryByText('Sua sessão expirou. Entre novamente.'),
      ).not.toBeInTheDocument();
      expect(routerMock.push).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
      window.history.pushState({}, '', '/');
    });
  });

  describe('Cenário: adoção do catálogo do design system', () => {
    it('Dado o formulário de senha, Então campos e submit vêm do Still Void', async () => {
      mockProviders({ password: true });

      render(<LoginPage />);

      const senha = await screen.findByLabelText('Senha');
      // SPEC_DEVIATION: na 3.x o <Input> do pacote emite a classe semântica
      // `sv-field` em vez do utilitário Tailwind `bg-sv-surface` da 2.x — mesma
      // mudança de implementação do Dialog/Button/Alert (ver
      // tests/components/modal.test.tsx), não listada nas 3 quebras do Problem
      // Statement da spec. `sv-btn--accent` abaixo vem de `variant="accent"`
      // (T34) — a receita local `accentButton` foi removida; a 3.x resolve a
      // variante para a classe semântica em vez do utilitário Tailwind
      // `bg-accent-ink` que a receita local emitia.
      expect(senha).toHaveClass('sv-field');
      expect(screen.getByRole('button', { name: 'Entrar' })).toHaveClass(
        'sv-btn--accent',
      );
    });
  });
});

/** B2 (ADR-007): segundo fator do super_admin dentro de /login. */
describe('Feature: Segundo fator do super_admin na tela de login', () => {
  type Handler = (
    body: Record<string, string>,
  ) => ReturnType<typeof jsonResponse>;

  function mockMfa(routes: Record<string, Handler>) {
    const calls: Array<{ url: string; body: Record<string, string> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/auth/providers')) {
          return jsonResponse(true, { password: true });
        }
        const body = JSON.parse(String(init?.body ?? '{}'));
        calls.push({ url, body });
        const handler = routes[url];
        if (!handler) throw new Error(`URL não mapeada no mock: ${url}`);
        return handler(body);
      }),
    );
    return calls;
  }

  async function signIn() {
    render(<LoginPage />);
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'dono@estomasystech.test' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'senha-do-dono' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  }

  const codes = Array.from({ length: 10 }, (_, i) => `abcde-fgh${i + 2}k`);

  it('Dado login que pede o código, Quando enviar o código, Então a etapa do código chama verify e leva ao início, que o proxy resolve por papel (#291)', async () => {
    const calls = mockMfa({
      '/api/auth/login': () =>
        jsonResponse(true, { mfaRequired: true, pendingToken: 'mfa.p.s' }),
      '/api/auth/mfa/verify': () => jsonResponse(true, { ok: true }),
    });
    await signIn();

    const field = await screen.findByLabelText('Código do autenticador');
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/'));
    expect(calls.at(-1)).toEqual({
      url: '/api/auth/mfa/verify',
      body: { pendingToken: 'mfa.p.s', code: '123456' },
    });
    expect(window.location.search).not.toContain('mfa.');
  });

  it('Dado next interno, Quando o código confere, Então volta ao next em vez do início (#207)', async () => {
    searchParamsRef.current = new URLSearchParams(
      'next=%2Fplataforma%2Ftaxonomia',
    );
    mockMfa({
      '/api/auth/login': () =>
        jsonResponse(true, { mfaRequired: true, pendingToken: 'mfa.p.s' }),
      '/api/auth/mfa/verify': () => jsonResponse(true, { ok: true }),
    });
    await signIn();

    fireEvent.change(await screen.findByLabelText('Código do autenticador'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() =>
      expect(routerMock.push).toHaveBeenCalledWith('/plataforma/taxonomia'),
    );
  });

  it('Dado código errado, Quando verificar, Então mostra o erro e volta ao login pelo link', async () => {
    mockMfa({
      '/api/auth/login': () =>
        jsonResponse(true, { mfaRequired: true, pendingToken: 'mfa.p.s' }),
      '/api/auth/mfa/verify': () =>
        jsonResponse(false, null, 'Código inválido'),
    });
    await signIn();
    fireEvent.change(await screen.findByLabelText('Código do autenticador'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText('Código inválido')).toBeInTheDocument();
    expect(routerMock.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    expect(await screen.findByLabelText('Senha')).toBeInTheDocument();
  });

  it('Dado login sem fator, Quando cadastrar, Então o cadastro do segundo fator mostra QR, chave e link, e os códigos uma vez', async () => {
    const calls = mockMfa({
      '/api/auth/login': () =>
        jsonResponse(true, {
          mfaEnrollmentRequired: true,
          pendingToken: 'mfa.e.s',
        }),
      '/api/auth/mfa/enroll': () =>
        jsonResponse(true, {
          secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          otpauthUri:
            'otpauth://totp/EstomaSysTech:dono%40estomasystech.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
          pendingToken: 'mfa.c.s',
        }),
      '/api/auth/mfa/verify': () =>
        jsonResponse(true, { recoveryCodes: codes }),
    });
    await signIn();

    expect(
      await screen.findByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir no app autenticador' }),
    ).toHaveAttribute(
      'href',
      'otpauth://totp/EstomaSysTech:dono%40estomasystech.test?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    );
    const qr = await screen.findByRole('img', {
      name: 'QR code para cadastrar o app autenticador',
    });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    fireEvent.change(screen.getByLabelText('Código do autenticador'), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    const list = await screen.findByRole('list', {
      name: 'Códigos de recuperação',
    });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    expect(screen.getByText(codes[0])).toBeInTheDocument();
    expect(calls.map((c) => c.url)).toEqual([
      '/api/auth/login',
      '/api/auth/mfa/enroll',
      '/api/auth/mfa/verify',
    ]);
    expect(calls[2].body).toEqual({ pendingToken: 'mfa.c.s', code: '654321' });
    expect(routerMock.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(routerMock.push).toHaveBeenCalledWith('/');
  });

  it('Dado a etapa do código, Quando usar um código de recuperação válido, Então o código de recuperação abre o cadastro', async () => {
    const calls = mockMfa({
      '/api/auth/login': () =>
        jsonResponse(true, { mfaRequired: true, pendingToken: 'mfa.p.s' }),
      '/api/auth/mfa/verify': () =>
        jsonResponse(true, {
          mfaEnrollmentRequired: true,
          pendingToken: 'mfa.e2.s',
        }),
      '/api/auth/mfa/enroll': () =>
        jsonResponse(true, {
          secret: 'ABCDEFGH',
          otpauthUri: 'otpauth://totp/x',
          pendingToken: 'mfa.c2.s',
        }),
    });
    await signIn();
    await screen.findByLabelText('Código do autenticador');
    fireEvent.click(
      screen.getByRole('button', { name: 'Usar um código de recuperação' }),
    );
    fireEvent.change(screen.getByLabelText('Código de recuperação'), {
      target: { value: 'abcde-fgh2k' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(
      await screen.findByText('Cadastre o app autenticador'),
    ).toBeInTheDocument();
    expect(await screen.findByText('ABCDEFGH')).toBeInTheDocument();
    expect(calls[1].body).toEqual({
      pendingToken: 'mfa.p.s',
      recoveryCode: 'abcde-fgh2k',
    });
    expect(calls[2]).toEqual({
      url: '/api/auth/mfa/enroll',
      body: { pendingToken: 'mfa.e2.s' },
    });
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('Dado token de cadastro expirado, Quando abrir o cadastro, Então mostra o erro e não habilita a confirmação', async () => {
    mockMfa({
      '/api/auth/login': () =>
        jsonResponse(true, {
          mfaEnrollmentRequired: true,
          pendingToken: 'mfa.e.s',
        }),
      '/api/auth/mfa/enroll': () =>
        jsonResponse(
          false,
          null,
          'Verificação expirada. Entre novamente com e-mail e senha.',
        ),
    });
    await signIn();

    expect(
      await screen.findByText(
        'Verificação expirada. Entre novamente com e-mail e senha.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });
});
