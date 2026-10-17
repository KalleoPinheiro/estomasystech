// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OwnAccountPage from '@/app/(staff)/minha-conta/page';
import PlatformOwnAccountPage from '@/app/plataforma/minha-conta/page';

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string, status = 400) => ({
  ok: false,
  status,
  json: async () => ({ success: false, data: null, error }),
});

interface Mocks {
  me?: unknown;
  password?: unknown;
  enroll?: unknown;
  verify?: unknown;
}

const ME = (enrolled: boolean, policy = 'optional') => ({
  email: 'ana@clinica.com',
  role: 'atendente',
  mfa: { policy, enrolled },
});

function mockFetch(mocks: Mocks) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me') return mocks.me ?? ok(ME(false));
    if (url === '/api/me/password') return mocks.password ?? ok({ ok: true });
    if (url === '/api/me/mfa/enroll') {
      return (
        mocks.enroll ??
        ok({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/x',
          pendingToken: 'tok',
        })
      );
    }
    if (url === '/api/me/mfa/confirm') {
      return mocks.verify ?? ok({ recoveryCodes: ['AAAA-1111', 'BBBB-2222'] });
    }
    return ok(null);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const bodiesOf = (fn: ReturnType<typeof mockFetch>, url: string) =>
  fn.mock.calls
    .filter(([called]) => called === url)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Minha conta — senha (#295)', () => {
  it('troca a senha com a atual e avisa que as outras sessões caíram', async () => {
    const fn = mockFetch({});
    render(<OwnAccountPage />);
    await screen.findByText('ana@clinica.com');

    fireEvent.change(screen.getAllByLabelText('Senha atual')[0], {
      target: { value: 'senha-atual-1' },
    });
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'xk7#pq2vzm-nova' },
    });
    fireEvent.change(screen.getByLabelText('Confirme a nova senha'), {
      target: { value: 'xk7#pq2vzm-nova' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(
      await screen.findByText(
        'Senha alterada. As outras sessões foram encerradas.',
      ),
    ).toBeInTheDocument();
    expect(bodiesOf(fn, '/api/me/password')).toEqual([
      { currentPassword: 'senha-atual-1', newPassword: 'xk7#pq2vzm-nova' },
    ]);
    expect(screen.getAllByLabelText('Senha atual')[0]).toHaveValue('');
  });

  it('confirmação diferente não chama a API', async () => {
    const fn = mockFetch({});
    render(<OwnAccountPage />);
    await screen.findByText('ana@clinica.com');

    fireEvent.change(screen.getAllByLabelText('Senha atual')[0], {
      target: { value: 'senha-atual-1' },
    });
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'xk7#pq2vzm-nova' },
    });
    fireEvent.change(screen.getByLabelText('Confirme a nova senha'), {
      target: { value: 'outra-coisa-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(
      await screen.findByText('As duas senhas não conferem'),
    ).toBeInTheDocument();
    expect(bodiesOf(fn, '/api/me/password')).toEqual([]);
  });

  it('senha atual errada mostra o erro da API', async () => {
    mockFetch({ password: failure('Senha atual incorreta') });
    render(<OwnAccountPage />);
    await screen.findByText('ana@clinica.com');

    for (const [label, value] of [
      ['Senha atual', 'errada-123456'],
      ['Nova senha', 'xk7#pq2vzm-nova'],
      ['Confirme a nova senha', 'xk7#pq2vzm-nova'],
    ]) {
      fireEvent.change(screen.getAllByLabelText(label)[0], {
        target: { value },
      });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));

    expect(
      await screen.findByText('Senha atual incorreta'),
    ).toBeInTheDocument();
  });

  it('falha ao carregar a conta mostra o erro', async () => {
    mockFetch({ me: failure('Conta não encontrada', 404) });
    render(<OwnAccountPage />);

    expect(await screen.findByText('Conta não encontrada')).toBeInTheDocument();
  });

  it('o Super Admin usa a mesma tela em /plataforma', async () => {
    mockFetch({ me: ok({ ...ME(true, 'required'), role: 'super_admin' }) });
    render(<PlatformOwnAccountPage />);

    expect(await screen.findByText('ana@clinica.com')).toBeInTheDocument();
    expect(screen.getByText(/Ativo\. Se perder o celular/)).toBeInTheDocument();
  });
});

describe('Feature: Minha conta — segundo fator opcional (#295)', () => {
  it('liga o fator: senha atual → chave → código → códigos de recuperação', async () => {
    const fn = mockFetch({});
    render(<OwnAccountPage />);
    await screen.findByText('ana@clinica.com');

    fireEvent.click(
      screen.getAllByLabelText('Senha atual').at(-1) as HTMLElement,
    );
    fireEvent.change(
      screen.getAllByLabelText('Senha atual').at(-1) as HTMLElement,
      {
        target: { value: 'senha-atual-1' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ligar segundo fator' }),
    );

    expect(await screen.findByTestId('mfa-secret')).toHaveTextContent(
      'JBSWY3DPEHPK3PXP',
    );
    expect(bodiesOf(fn, '/api/me/mfa/enroll')).toEqual([
      { currentPassword: 'senha-atual-1' },
    ]);

    fireEvent.change(screen.getByLabelText('Código do autenticador'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('AAAA-1111')).toBeInTheDocument();
    expect(bodiesOf(fn, '/api/me/mfa/confirm')).toEqual([
      { pendingToken: 'tok', code: '123456' },
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Já guardei os códigos' }),
    );
    await waitFor(() =>
      expect(fn.mock.calls.filter(([url]) => url === '/api/me')).toHaveLength(
        2,
      ),
    );
  });

  it('senha atual errada na ativação mostra o erro e não pede código', async () => {
    mockFetch({ enroll: failure('Senha atual incorreta') });
    render(<OwnAccountPage />);
    await screen.findByText('ana@clinica.com');

    fireEvent.change(
      screen.getAllByLabelText('Senha atual').at(-1) as HTMLElement,
      {
        target: { value: 'errada' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ligar segundo fator' }),
    );

    expect(
      await screen.findByText('Senha atual incorreta'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mfa-secret')).toBeNull();
  });

  it('código errado mostra o erro e mantém a chave para tentar de novo', async () => {
    mockFetch({ verify: failure('Código inválido') });
    render(<OwnAccountPage />);
    await screen.findByText('ana@clinica.com');

    fireEvent.change(
      screen.getAllByLabelText('Senha atual').at(-1) as HTMLElement,
      {
        target: { value: 'senha-atual-1' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ligar segundo fator' }),
    );
    await screen.findByTestId('mfa-secret');
    fireEvent.change(screen.getByLabelText('Código do autenticador'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Código inválido')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-secret')).toBeInTheDocument();
  });

  it('fator já ativo não oferece ligar; papel sem fator avisa', async () => {
    mockFetch({ me: ok(ME(true)) });
    const { unmount } = render(<OwnAccountPage />);
    expect(
      await screen.findByText(/Ativo\. Se perder o celular/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ligar segundo fator' }),
    ).toBeNull();
    unmount();

    mockFetch({ me: ok(ME(false, 'none')) });
    render(<OwnAccountPage />);
    expect(
      await screen.findByText('Este tipo de conta não usa segundo fator.'),
    ).toBeInTheDocument();
  });
});
