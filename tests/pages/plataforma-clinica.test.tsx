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
  createdAt: '2026-09-27T00:00:00.000Z',
};

const SUSPENDED_CLINIC = {
  ...CLINIC,
  status: 'suspended',
  statusChangedAt: '2026-09-27T15:30:00.000Z',
  statusChangedBy: 'dono@vitta.app',
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

const mockApi = (clinicResponse = envelope(CLINIC)) => {
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
      return envelope({ delivered: null });
    }
    if (method === 'POST') {
      return envelope({ email: 'novo@um.com', delivered: true });
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

  it('Dada clínica ativa, Quando clicar em Suspender clínica, Então suspende com confirmação: o POST só sai depois de confirmar', async () => {
    const fetchMock = mockApi();
    renderWithToast(<PlatformClinicPage />);

    expect(await screen.findByText('Clínica ativa.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suspender clínica' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Suspender clínica?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Todas as contas da clínica — equipe, pacientes e parceiros — perdem o acesso em até 1 minuto e os lembretes param. Nenhum dado é apagado.',
      ),
    ).toBeInTheDocument();
    expect(callsWith(fetchMock, 'POST')).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspender' }));

    await waitFor(() => expect(callsWith(fetchMock, 'POST')).toHaveLength(1));
    expect(callsWith(fetchMock, 'POST')[0][0]).toBe(
      '/api/platform/clinics/c1/suspend',
    );
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
    expect(screen.getAllByText('Suspensa').length).toBeGreaterThanOrEqual(1);
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
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
