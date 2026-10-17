// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformClinicPage from '@/app/plataforma/clinicas/[id]/page';
import { formatDateTime } from '@/lib/format';
import { renderWithToast } from '../support/render-with-toast';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/plataforma/clinicas/c1',
}));

const CLINIC = {
  id: 'c1',
  name: 'Clínica Um',
  cnpj: '12.345.678/0001-95',
  contactPhone: '11 3333-4444',
  contactEmail: 'contato@um.com',
  address: null,
  city: null,
  professionalName: null,
  professionalRegistry: null,
  registrationComplete: true,
  status: 'active',
  statusChangedAt: null,
  statusChangedBy: null,
  statusReason: null,
  statusReasonNote: null,
  createdAt: '2026-09-27T00:00:00.000Z',
  emailChannel: {
    configured: false,
    provider: null,
    lastStatus: null,
    lastStatusAt: null,
  },
};

const SUSPENDED_CLINIC = {
  ...CLINIC,
  status: 'suspended',
  statusChangedAt: '2026-09-27T15:30:00.000Z',
  statusChangedBy: 'dono@vitta.app',
  statusReason: 'non_payment',
  statusReasonNote: 'Três faturas em atraso',
};

const ADMINS = [
  { id: 'a1', email: 'ativo@um.com', active: true, passwordSet: true },
  { id: 'a2', email: 'pendente@um.com', active: true, passwordSet: false },
  { id: 'a3', email: 'saiu@um.com', active: false, passwordSet: true },
];

const envelope = (
  data: unknown,
  ok = true,
  status = 200,
  error: string | null = null,
) => ({
  ok,
  status,
  json: async () => ({ success: ok, data, error }),
});

type Call = [string, RequestInit | undefined];

const mockApi = (
  clinicResponse = envelope(CLINIC),
  patchResponse: unknown = { delivered: null },
  postResponse: unknown = { email: 'novo@um.com', delivered: true },
) => {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/platform/clinics/c1' && method === 'GET') {
      return clinicResponse;
    }
    if (url === '/api/platform/clinics/c1/admins' && method === 'GET') {
      return envelope(ADMINS);
    }
    if (
      method === 'PATCH' &&
      url.startsWith('/api/platform/clinics/c1/admins/')
    ) {
      return envelope(patchResponse);
    }
    if (method === 'POST') {
      return envelope(postResponse);
    }
    return envelope(CLINIC);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

const callsWith = (fn: ReturnType<typeof mockApi>, method: string) =>
  (fn.mock.calls as Call[]).filter(([, init]) => init?.method === method);

describe('Feature: Detalhe da clínica na plataforma (B4, Journey 4–6)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dado o cadastro carregado, Quando editar o telefone e salvar, Então edita o cadastro por PATCH', async () => {
    const fetchMock = mockApi();
    renderWithToast(<PlatformClinicPage />);

    const phone = await screen.findByLabelText('Telefone/WhatsApp de contato', {
      exact: false,
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Clínica Um' }),
    ).toBeInTheDocument();
    fireEvent.change(phone, { target: { value: '11 90000-0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }));

    await waitFor(() => expect(callsWith(fetchMock, 'PATCH')).toHaveLength(1));
    const [url, init] = callsWith(fetchMock, 'PATCH')[0];
    expect(url).toBe('/api/platform/clinics/c1');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Clínica Um',
      contactPhone: '11 90000-0000',
      contactEmail: 'contato@um.com',
    });
  });

  it('Dados admins nos três estados, Quando agir, Então as ações dos admins seguem o estado e desativar pede confirmação', async () => {
    const fetchMock = mockApi();
    renderWithToast(<PlatformClinicPage />);

    const pendingRow = (await screen.findByText('pendente@um.com')).closest(
      'tr',
    ) as HTMLElement;
    const activeRow = screen
      .getByText('ativo@um.com')
      .closest('tr') as HTMLElement;
    const inactiveRow = screen
      .getByText('saiu@um.com')
      .closest('tr') as HTMLElement;
    expect(
      within(activeRow).queryByRole('button', { name: 'Reenviar convite' }),
    ).toBeNull();
    expect(
      within(inactiveRow).queryByRole('button', { name: 'Desativar' }),
    ).toBeNull();
    expect(
      within(inactiveRow).queryByRole('button', { name: 'Reenviar convite' }),
    ).toBeNull();

    fireEvent.click(
      within(pendingRow).getByRole('button', { name: 'Reenviar convite' }),
    );
    await waitFor(() => expect(callsWith(fetchMock, 'PATCH')).toHaveLength(1));
    expect(callsWith(fetchMock, 'PATCH')[0][0]).toBe(
      '/api/platform/clinics/c1/admins/a2',
    );
    expect(
      JSON.parse(callsWith(fetchMock, 'PATCH')[0][1]?.body as string),
    ).toEqual({
      action: 'resend-invite',
    });

    fireEvent.click(
      within(activeRow).getByRole('button', { name: 'Desativar' }),
    );
    expect(callsWith(fetchMock, 'PATCH')).toHaveLength(1);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(callsWith(fetchMock, 'PATCH')).toHaveLength(2));
    expect(callsWith(fetchMock, 'PATCH')[1][0]).toBe(
      '/api/platform/clinics/c1/admins/a1',
    );
    expect(
      JSON.parse(callsWith(fetchMock, 'PATCH')[1][1]?.body as string),
    ).toEqual({
      action: 'deactivate',
    });

    fireEvent.click(
      within(inactiveRow).getByRole('button', { name: 'Reativar' }),
    );
    await waitFor(() => expect(callsWith(fetchMock, 'PATCH')).toHaveLength(3));
    expect(
      JSON.parse(callsWith(fetchMock, 'PATCH')[2][1]?.body as string),
    ).toEqual({
      action: 'reactivate',
    });

    fireEvent.change(
      screen.getByLabelText('E-mail do admin', { exact: false }),
      {
        target: { value: 'novo@um.com' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Convidar admin' }));
    await waitFor(() => expect(callsWith(fetchMock, 'POST')).toHaveLength(1));
    expect(callsWith(fetchMock, 'POST')[0][0]).toBe(
      '/api/platform/clinics/c1/admins',
    );
    expect(
      JSON.parse(callsWith(fetchMock, 'POST')[0][1]?.body as string),
    ).toEqual({
      email: 'novo@um.com',
    });
  });

  it('Dada clínica inexistente, Quando abrir o detalhe, Então mostra Clínica não encontrada', async () => {
    mockApi(envelope(null, false, 404, 'Clínica não encontrada'));
    renderWithToast(<PlatformClinicPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Clínica não encontrada',
    );
    expect(
      screen.queryByRole('button', { name: 'Tentar novamente' }),
    ).toBeNull();
  });
});

describe('Feature: Suspender e reativar no detalhe da clínica (B5, Journey 7 e 8)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dada clínica ativa, Quando clicar em Suspender clínica, Então o motivo é obrigatório e o POST só sai depois de confirmar, com motivo e observação', async () => {
    const fetchMock = mockApi();
    renderWithToast(<PlatformClinicPage />);

    expect(await screen.findByText('Clínica ativa.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suspender clínica' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Suspender clínica?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/perdem o acesso em até 1 minuto/),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Suspender' });
    expect(confirm).toBeDisabled();
    expect(callsWith(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'non_payment' },
    });
    fireEvent.change(within(dialog).getByLabelText('Observação (opcional)'), {
      target: { value: '  Três faturas em atraso  ' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(callsWith(fetchMock, 'POST')).toHaveLength(1));
    const [url, init] = callsWith(fetchMock, 'POST')[0];
    expect(url).toBe('/api/platform/clinics/c1/suspend');
    expect(JSON.parse(init?.body as string)).toEqual({
      reason: 'non_payment',
      note: 'Três faturas em atraso',
    });
    expect(await screen.findByText('Clínica suspensa')).toBeInTheDocument();
  });

  it('Dada a confirmação aberta, Quando cancelar, Então nada é enviado; sem observação, vai note nulo', async () => {
    const fetchMock = mockApi();
    renderWithToast(<PlatformClinicPage />);

    await screen.findByText('Clínica ativa.');
    fireEvent.click(screen.getByRole('button', { name: 'Suspender clínica' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(callsWith(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Suspender clínica' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Motivo'), {
      target: { value: 'other' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));

    await waitFor(() => expect(callsWith(fetchMock, 'POST')).toHaveLength(1));
    expect(
      JSON.parse(callsWith(fetchMock, 'POST')[0][1]?.body as string),
    ).toEqual({ reason: 'other', note: null });
  });

  it('Dada clínica suspensa antes da #251, Quando abrir o detalhe, Então avisa que o motivo não foi registrado', async () => {
    mockApi(
      envelope({
        ...SUSPENDED_CLINIC,
        statusReason: null,
        statusReasonNote: null,
      }),
    );
    renderWithToast(<PlatformClinicPage />);

    expect(
      await screen.findByText('Motivo não registrado.'),
    ).toBeInTheDocument();
  });

  it('Dada clínica suspensa, Quando abrir o detalhe, Então selo, data e autor, reativar direto, convite desabilitado e sem reenviar', async () => {
    const fetchMock = mockApi(envelope(SUSPENDED_CLINIC));
    renderWithToast(<PlatformClinicPage />);

    const since = `${new Date(SUSPENDED_CLINIC.statusChangedAt).toLocaleDateString('pt-BR')} ${new Date(
      SUSPENDED_CLINIC.statusChangedAt,
    ).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    expect(
      await screen.findByText(`Suspensa em ${since} por dono@vitta.app.`),
    ).toBeInTheDocument();
    expect(screen.getByText('Inadimplência')).toBeInTheDocument();
    expect(screen.getByText('Três faturas em atraso')).toBeInTheDocument();
    const title = screen.getByRole('heading', { level: 1, name: 'Clínica Um' });
    expect(
      within(title.parentElement as HTMLElement).getByText('Suspensa'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Suspender clínica' }),
    ).toBeNull();

    const pendingRow = (await screen.findByText('pendente@um.com')).closest(
      'tr',
    ) as HTMLElement;
    expect(
      within(pendingRow).queryByRole('button', { name: 'Reenviar convite' }),
    ).toBeNull();
    expect(
      screen.getByText(
        'Clínica suspensa: reative a clínica antes de convidar o admin.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Convidar admin' }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Reativar clínica' }));
    await waitFor(() => expect(callsWith(fetchMock, 'POST')).toHaveLength(1));
    expect(callsWith(fetchMock, 'POST')[0][0]).toBe(
      '/api/platform/clinics/c1/reactivate',
    );
    expect(await screen.findByText('Clínica reativada')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  describe('C2/#265 link manual', () => {
    const LINK_URL = 'https://app.vitta.test/definir-senha?token=segredo-9';

    it('link manual: reenvio que volta delivered false mostra o link com Copiar link', async () => {
      mockApi(envelope(CLINIC), { delivered: false, inviteUrl: LINK_URL });
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      renderWithToast(<PlatformClinicPage />);

      const pendingRow = (await screen.findByText('pendente@um.com')).closest(
        'tr',
      ) as HTMLElement;
      fireEvent.click(
        within(pendingRow).getByRole('button', { name: 'Reenviar convite' }),
      );

      expect(await screen.findByLabelText('Link de acesso')).toHaveValue(
        LINK_URL,
      );
      expect(
        screen.getByText(
          'O e-mail não saiu — envie este link a pendente@um.com.',
        ),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK_URL));
    });

    it('convite: admin convidado sem e-mail entregue mostra o link com Copiar link', async () => {
      mockApi(envelope(CLINIC), undefined, {
        email: 'novo@um.com',
        delivered: false,
        inviteUrl: LINK_URL,
      });
      renderWithToast(<PlatformClinicPage />);
      await screen.findByText('pendente@um.com');

      fireEvent.change(
        screen.getByLabelText('E-mail do admin', { exact: false }),
        { target: { value: 'novo@um.com' } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Convidar admin' }));

      expect(await screen.findByLabelText('Link de acesso')).toHaveValue(
        LINK_URL,
      );
      expect(
        screen.getByText('O e-mail não saiu — envie este link a novo@um.com.'),
      ).toBeInTheDocument();
    });

    it('convite: admin convidado com e-mail entregue não mostra link', async () => {
      mockApi(envelope(CLINIC), undefined, {
        email: 'novo@um.com',
        delivered: true,
        inviteUrl: null,
      });
      renderWithToast(<PlatformClinicPage />);
      await screen.findByText('pendente@um.com');

      fireEvent.change(
        screen.getByLabelText('E-mail do admin', { exact: false }),
        { target: { value: 'novo@um.com' } },
      );
      fireEvent.click(screen.getByRole('button', { name: 'Convidar admin' }));

      expect(
        await screen.findByText('Convite enviado para novo@um.com'),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Link de acesso')).toBeNull();
    });

    it('redefinição: Gerar link de redefinição pede confirmação, só então chama reset-link e mostra o link', async () => {
      const fetchMock = mockApi(envelope(CLINIC), {
        delivered: false,
        inviteUrl: LINK_URL,
      });
      renderWithToast(<PlatformClinicPage />);

      const activeRow = (await screen.findByText('ativo@um.com')).closest(
        'tr',
      ) as HTMLElement;
      const pendingRow = screen
        .getByText('pendente@um.com')
        .closest('tr') as HTMLElement;
      expect(
        within(pendingRow).queryByRole('button', {
          name: 'Gerar link de redefinição',
        }),
      ).toBeNull();
      fireEvent.click(
        within(activeRow).getByRole('button', {
          name: 'Gerar link de redefinição',
        }),
      );
      const dialog = await screen.findByRole('alertdialog');
      expect(
        within(dialog).getByText(
          'Gerar um link de redefinição de senha para ativo@um.com? Links anteriores deixam de valer.',
        ),
      ).toBeInTheDocument();
      expect(callsWith(fetchMock, 'PATCH')).toHaveLength(0);

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Gerar link' }),
      );

      await waitFor(() =>
        expect(callsWith(fetchMock, 'PATCH')).toHaveLength(1),
      );
      expect(callsWith(fetchMock, 'PATCH')[0][0]).toBe(
        '/api/platform/clinics/c1/admins/a1',
      );
      expect(
        JSON.parse(callsWith(fetchMock, 'PATCH')[0][1]?.body as string),
      ).toEqual({ action: 'reset-link' });
      expect(await screen.findByLabelText('Link de acesso')).toHaveValue(
        LINK_URL,
      );
    });

    it('segundo fator: Redefinir segundo fator pede confirmação e chama a ação reset-mfa', async () => {
      const fetchMock = mockApi(envelope(CLINIC), {});
      renderWithToast(<PlatformClinicPage />);

      const activeRow = (await screen.findByText('ativo@um.com')).closest(
        'tr',
      ) as HTMLElement;
      fireEvent.click(
        within(activeRow).getByRole('button', {
          name: 'Redefinir segundo fator',
        }),
      );
      const dialog = await screen.findByRole('alertdialog');
      expect(callsWith(fetchMock, 'PATCH')).toHaveLength(0);

      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Redefinir' }),
      );

      await waitFor(() =>
        expect(callsWith(fetchMock, 'PATCH')).toHaveLength(1),
      );
      expect(
        JSON.parse(callsWith(fetchMock, 'PATCH')[0][1]?.body as string),
      ).toEqual({ action: 'reset-mfa' });
      expect(
        await screen.findByText('Segundo fator redefinido'),
      ).toBeInTheDocument();
    });
  });
});

describe('Feature: status do canal de e-mail no detalhe (C4, #267)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const sectionOf = async () =>
    within(
      (await screen.findByRole('heading', { name: 'Canal de e-mail' })).closest(
        'section',
      ) as HTMLElement,
    );

  it('Dado canal testado com falha, Quando abrir o detalhe, Então mostra o status, o provedor e a data do último teste', async () => {
    mockApi(
      envelope({
        ...CLINIC,
        emailChannel: {
          configured: true,
          provider: 'resend',
          lastStatus: 'failed',
          lastStatusAt: '2026-10-09T14:30:00.000Z',
        },
      }),
    );
    renderWithToast(<PlatformClinicPage />);

    const section = await sectionOf();
    expect(section.getByText('E-mail: falhando')).toBeInTheDocument();
    expect(section.getByText('Provedor: Resend')).toBeInTheDocument();
    expect(
      section.getByText(
        `Último teste: ${formatDateTime('2026-10-09T14:30:00.000Z')}`,
      ),
    ).toBeInTheDocument();
  });

  it('Dado canal nunca testado e clínica sem canal, Quando abrir o detalhe, Então mostra Nunca testado', async () => {
    mockApi(
      envelope({
        ...CLINIC,
        emailChannel: {
          configured: true,
          provider: 'resend',
          lastStatus: null,
          lastStatusAt: null,
        },
      }),
    );
    renderWithToast(<PlatformClinicPage />);
    let section = await sectionOf();
    expect(section.getByText('E-mail: não testado')).toBeInTheDocument();
    expect(section.getByText('Provedor: Resend')).toBeInTheDocument();
    expect(section.getByText('Nunca testado')).toBeInTheDocument();
    cleanup();
    vi.unstubAllGlobals();

    mockApi();
    renderWithToast(<PlatformClinicPage />);
    section = await sectionOf();
    expect(section.getByText('E-mail: sem canal')).toBeInTheDocument();
    expect(section.getByText('Provedor: —')).toBeInTheDocument();
    expect(section.getByText('Nunca testado')).toBeInTheDocument();
  });
});
