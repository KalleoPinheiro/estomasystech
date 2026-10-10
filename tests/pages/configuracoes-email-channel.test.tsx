// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { EmailChannelSection } from '@/app/(staff)/configuracoes/email-channel-section';
import type { EmailChannelDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { StaffIdentityProvider } from '@/lib/staff-access';

const ADMIN_EMAIL = 'admin@clinicax.com.br';
const ENDPOINT = '/api/settings/email-channel';

const okEnvelope = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ success: true, data, error: null }),
});
const failEnvelope = (status: number, error: string) => ({
  ok: false,
  status,
  json: async () => ({ success: false, data: null, error }),
});

const CHANNEL: EmailChannelDto = {
  provider: 'resend',
  sender: 'Clínica X <contato@clinicax.com.br>',
  secretLast4: '1234',
  lastStatus: null,
  lastStatusAt: null,
  lastError: null,
};

type Handler = (init?: RequestInit) => unknown;

interface Calls {
  method: string;
  url: string;
  body: unknown;
}

/** Identidade da sessão + respostas por `MÉTODO url`; registra as chamadas. */
function mockFetch(
  routes: Record<string, Handler>,
  role: string = 'company_admin',
): Calls[] {
  const calls: Calls[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url === '/api/auth/identity') {
        return okEnvelope({
          clinicLabel: 'Clínica X',
          account: { email: ADMIN_EMAIL, role, roleLabel: role },
        });
      }
      const handler = routes[`${method} ${url}`];
      return handler ? handler(init) : okEnvelope(null);
    }),
  );
  return calls;
}

/** Respostas sucessivas: a última se repete. */
const sequence = (...responses: unknown[]): Handler => {
  let i = 0;
  return () => responses[Math.min(i++, responses.length - 1)];
};

const renderSection = () =>
  renderWithToast(
    <StaffIdentityProvider>
      <EmailChannelSection />
    </StaffIdentityProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: seção "Canal de e-mail" em /configuracoes (C3, #266)', () => {
  it('sem canal: mostra o aviso e o formulário vazio com Provedor = Resend', async () => {
    mockFetch({ [`GET ${ENDPOINT}`]: () => okEnvelope({ channel: null }) });

    renderSection();

    expect(
      await screen.findByText(
        'Nenhum canal configurado — e-mails automáticos, convites e redefinições não são enviados por esta clínica.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Canal de e-mail' }),
    ).toBeVisible();
    const provider = screen.getByLabelText('Provedor') as HTMLSelectElement;
    expect(provider.value).toBe('resend');
    expect(within(provider).getByRole('option').textContent).toBe('Resend');
    expect(screen.getByLabelText('Remetente')).toHaveValue('');
    expect(screen.getByLabelText(/Chave de API/)).toHaveValue('');
    expect(screen.queryByText('Enviar e-mail de teste')).toBeNull();
    expect(screen.queryByText('Remover canal')).toBeNull();
  });

  it('salva e mostra a chave como •••• + secretLast4', async () => {
    const calls = mockFetch({
      [`GET ${ENDPOINT}`]: sequence(
        okEnvelope({ channel: null }),
        okEnvelope({ channel: CHANNEL }),
      ),
      [`PUT ${ENDPOINT}`]: () => okEnvelope({ channel: CHANNEL }),
    });
    renderSection();
    await screen.findByText(/Nenhum canal configurado/);

    fireEvent.change(screen.getByLabelText('Remetente'), {
      target: { value: CHANNEL.sender },
    });
    fireEvent.change(screen.getByLabelText(/Chave de API/), {
      target: { value: 're_segredo_1234' },
    });
    fireEvent.click(screen.getByText('Salvar canal'));

    expect(
      await screen.findByText('Chave atual: ••••1234'),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
      provider: 'resend',
      sender: CHANNEL.sender,
      apiKey: 're_segredo_1234',
    });
    expect(screen.queryByText(/Nenhum canal configurado/)).toBeNull();
    // A chave digitada não fica no campo depois de salvar.
    expect(screen.getByLabelText(/Chave de API/)).toHaveValue('');
  });

  it('erro ao salvar mostra a mensagem da API', async () => {
    mockFetch({
      [`GET ${ENDPOINT}`]: () => okEnvelope({ channel: null }),
      [`PUT ${ENDPOINT}`]: () => failEnvelope(400, 'Chave de API obrigatória'),
    });
    renderSection();
    await screen.findByText(/Nenhum canal configurado/);

    fireEvent.click(screen.getByText('Salvar canal'));

    expect(
      await screen.findByText('Chave de API obrigatória'),
    ).toBeInTheDocument();
  });

  it('teste ok: mostra "Teste enviado para <e-mail> em <data e hora>"', async () => {
    const at = '2026-10-10T13:45:00.000Z';
    mockFetch({
      [`GET ${ENDPOINT}`]: () => okEnvelope({ channel: CHANNEL }),
      [`POST ${ENDPOINT}/test`]: () =>
        okEnvelope({ lastStatus: 'ok', lastStatusAt: at, lastError: null }),
    });
    renderSection();

    fireEvent.click(await screen.findByText('Enviar e-mail de teste'));

    expect(
      await screen.findByText(
        `Teste enviado para ${ADMIN_EMAIL} em ${formatDateTime(at)}`,
      ),
    ).toBeInTheDocument();
  });

  it('teste falho: mostra lastError num Alert de erro', async () => {
    mockFetch({
      [`GET ${ENDPOINT}`]: () => okEnvelope({ channel: CHANNEL }),
      [`POST ${ENDPOINT}/test`]: () =>
        okEnvelope({
          lastStatus: 'failed',
          lastStatusAt: '2026-10-10T13:45:00.000Z',
          lastError: 'Resend API 403: domain is not verified',
        }),
    });
    renderSection();

    fireEvent.click(await screen.findByText('Enviar e-mail de teste'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Resend API 403: domain is not verified');
    expect(alert).toHaveClass('sv-alert--danger');
  });

  it('teste sem canal no servidor (409) mostra a mensagem da API', async () => {
    mockFetch({
      [`GET ${ENDPOINT}`]: () => okEnvelope({ channel: CHANNEL }),
      [`POST ${ENDPOINT}/test`]: () =>
        failEnvelope(409, 'Configure o canal antes de testar'),
    });
    renderSection();

    fireEvent.click(await screen.findByText('Enviar e-mail de teste'));

    expect(
      await screen.findByText('Configure o canal antes de testar'),
    ).toBeInTheDocument();
  });

  it('mostra o último teste gravado ao abrir', async () => {
    mockFetch({
      [`GET ${ENDPOINT}`]: () =>
        okEnvelope({
          channel: {
            ...CHANNEL,
            lastStatus: 'ok',
            lastStatusAt: '2026-10-09T10:00:00.000Z',
          },
        }),
    });
    renderSection();

    expect(
      await screen.findByText(
        `Último teste enviado em ${formatDateTime('2026-10-09T10:00:00.000Z')}`,
      ),
    ).toBeInTheDocument();
  });

  it('remover: ConfirmAction com o texto da task e, confirmado, chama DELETE', async () => {
    const calls = mockFetch({
      [`GET ${ENDPOINT}`]: sequence(
        okEnvelope({ channel: CHANNEL }),
        okEnvelope({ channel: null }),
      ),
      [`DELETE ${ENDPOINT}`]: () => okEnvelope({ removed: true }),
    });
    renderSection();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Remover canal' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Remover o canal de e-mail? A clínica deixa de enviar e-mails automáticos, convites e redefinições.',
    );
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Remover canal' }),
    );

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === 'DELETE' && c.url === ENDPOINT),
      ).toBe(true),
    );
    expect(
      await screen.findByText(/Nenhum canal configurado/),
    ).toBeInTheDocument();
  });

  it.each(['atendente', 'profissional', 'patient', 'partner', 'super_admin'])(
    'não aparece para papel sem acesso (%s) e nem chama a API',
    async (role) => {
      const calls = mockFetch(
        { [`GET ${ENDPOINT}`]: () => okEnvelope({ channel: CHANNEL }) },
        role,
      );

      renderSection();

      await waitFor(() =>
        expect(calls.some((c) => c.url === '/api/auth/identity')).toBe(true),
      );
      // Dá tempo à identidade chegar antes de afirmar a ausência.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByText('Canal de e-mail')).toBeNull();
      expect(calls.some((c) => c.url === ENDPOINT)).toBe(false);
    },
  );

  it('carregando mostra LoadingIndicator; falha mostra ErrorAlert com a mensagem da API', async () => {
    let release: (value: unknown) => void = () => undefined;
    mockFetch({
      [`GET ${ENDPOINT}`]: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    renderSection();

    expect(await screen.findByText('Carregando…')).toBeInTheDocument();
    release(failEnvelope(500, 'Erro interno do servidor'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Erro interno do servidor');
    expect(screen.queryByText('Carregando…')).toBeNull();
  });
});
