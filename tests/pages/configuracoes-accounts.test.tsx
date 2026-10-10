// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickPatient } from '@/../tests/support/patient-picker';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '@/app/(staff)/configuracoes/page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const MARIA = {
  id: 'pac-1',
  fullName: 'Maria Portal',
  email: 'maria.cadastro@x.com',
  phone: '11999990000',
  active: true,
};
const PARTNER = {
  id: 'par-1',
  fullName: 'Dr. Parceiro',
  email: 'parceiro.cadastro@x.com',
  phone: '1',
  crm: null,
  specialty: null,
  active: true,
};

interface SettingsFetchOptions {
  /** Contas listadas em `GET /api/accounts`. */
  accounts?: unknown[];
  /** Resposta do `POST /api/accounts`. */
  created?: unknown;
  /** Resposta de `resend-invite` e `reset-link`. */
  linkResult?: unknown;
}

/** Responde a tudo que a tela de configurações carrega e captura o POST de conta. */
function mockSettingsFetch(
  posted: unknown[],
  options: SettingsFetchOptions = {},
) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/accounts' && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      return ok(
        options.created ?? {
          id: 'acc-1',
          email: 'x',
          delivered: true,
          inviteUrl: null,
        },
      );
    }
    if (/^\/api\/accounts\/[^/]+\/(resend-invite|reset-link)$/.test(url)) {
      posted.push(url);
      return ok(options.linkResult ?? { delivered: true, inviteUrl: null });
    }
    if (url.startsWith('/api/settings/schedule/closures')) return ok([]);
    if (url.startsWith('/api/settings/schedule'))
      return ok({
        config: { weekdays: [], startHour: 8, endHour: 18, minGapMinutes: 30 },
        isDefault: true,
      });
    if (url.startsWith('/api/settings/clinic-info'))
      return ok({
        info: {
          name: 'Clínica',
          cnpj: null,
          address: null,
          city: null,
          professionalName: null,
          professionalRegistry: null,
        },
      });
    if (url.startsWith('/api/settings/calendar-integration'))
      return ok({ connected: false, email: null, connectedAt: null });
    if (url.startsWith('/api/patients/pac-1')) return ok(MARIA);
    if (url.startsWith('/api/patients')) return ok([MARIA]);
    if (url.startsWith('/api/partners')) return ok([PARTNER]);
    if (url.startsWith('/api/accounts')) return ok(options.accounts ?? []);
    if (url.startsWith('/api/professionals')) return ok([]);
    return ok(null);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function openNewAccount(role: string) {
  renderWithToast(<SettingsPage />);
  await screen.findByText(/Nenhuma conta cadastrada nesta empresa/);
  fireEvent.click(screen.getByText('+ Nova conta'));
  fireEvent.change(screen.getByLabelText(/Papel/), {
    target: { value: role },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Feature: conta de portal vinculada ao cadastro (#196)', () => {
  it('patient account sends patientId: exige escolher o paciente, sugere o e-mail e envia o vínculo', async () => {
    const posted: unknown[] = [];
    mockSettingsFetch(posted);
    await openNewAccount('patient');

    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: 'sem-vinculo@x.com' },
    });
    fireEvent.click(screen.getByText('Criar conta'));
    expect(
      await screen.findByText(
        'Selecione o paciente dono desta conta de portal',
      ),
    ).toBeInTheDocument();
    expect(posted).toHaveLength(0);

    await pickPatient('Maria Portal', /Paciente vinculado/);
    expect(screen.getByLabelText(/Email/)).toHaveValue('maria.cadastro@x.com');
    // O login pode ser de outra pessoa (cuidador).
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: 'cuidadora@x.com' },
    });
    fireEvent.click(screen.getByText('Criar conta'));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      email: 'cuidadora@x.com',
      role: 'patient',
      patientId: 'pac-1',
    });
    expect(posted[0]).not.toHaveProperty('partnerId');
  });

  it('conta de parceiro envia partnerId escolhido na lista de parceiros', async () => {
    const posted: unknown[] = [];
    mockSettingsFetch(posted);
    await openNewAccount('partner');

    fireEvent.change(await screen.findByLabelText(/Parceiro vinculado/), {
      target: { value: 'par-1' },
    });
    await screen.findByDisplayValue('Dr. Parceiro');
    expect(screen.getByLabelText(/Email/)).toHaveValue(
      'parceiro.cadastro@x.com',
    );
    fireEvent.click(screen.getByText('Criar conta'));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      role: 'partner',
      partnerId: 'par-1',
    });
    expect(posted[0]).not.toHaveProperty('patientId');
  });
});

describe('Feature: link manual quando o e-mail não sai (C2, #265)', () => {
  const LINK_URL = 'https://app.vitta.test/definir-senha?token=segredo-7';
  const NOTICE = 'E-mail desativado nesta clínica — envie o link manualmente.';
  const ACTIVE = {
    id: 'acc-9',
    email: 'ativa@x.com',
    role: 'atendente',
    active: true,
    passwordSet: true,
    professionalId: null,
  };
  const PENDING = {
    ...ACTIVE,
    id: 'acc-8',
    email: 'pendente@x.com',
    passwordSet: false,
  };

  const stubClipboard = () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  };

  it('link manual na criação: delivered false mostra o link, Copiar link e o aviso de e-mail desativado', async () => {
    const posted: unknown[] = [];
    mockSettingsFetch(posted, {
      created: {
        id: 'acc-1',
        email: 'nova@x.com',
        delivered: false,
        inviteUrl: LINK_URL,
      },
    });
    const writeText = stubClipboard();
    await openNewAccount('atendente');
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: 'nova@x.com' },
    });
    fireEvent.click(screen.getByText('Criar conta'));

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByLabelText('Link para nova@x.com')).toHaveValue(LINK_URL);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK_URL));
  });

  it('link manual no reenvio: delivered false mostra o link e o aviso', async () => {
    const posted: unknown[] = [];
    mockSettingsFetch(posted, {
      accounts: [PENDING],
      linkResult: { delivered: false, inviteUrl: LINK_URL },
    });
    renderWithToast(<SettingsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reenviar convite' }),
    );

    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByLabelText('Link para pendente@x.com')).toHaveValue(
      LINK_URL,
    );
    expect(posted).toEqual(['/api/accounts/acc-8/resend-invite']);
  });

  it('redefinição: Gerar link de redefinição pede confirmação, só então chama reset-link e mostra o link', async () => {
    const posted: unknown[] = [];
    mockSettingsFetch(posted, {
      accounts: [ACTIVE, PENDING],
      linkResult: { delivered: false, inviteUrl: LINK_URL },
    });
    renderWithToast(<SettingsPage />);

    const pendingRow = (await screen.findByText('pendente@x.com')).closest(
      'tr',
    ) as HTMLElement;
    expect(
      within(pendingRow).queryByRole('button', {
        name: 'Gerar link de redefinição',
      }),
    ).toBeNull();
    const activeRow = screen
      .getByText('ativa@x.com')
      .closest('tr') as HTMLElement;
    fireEvent.click(
      within(activeRow).getByRole('button', {
        name: 'Gerar link de redefinição',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Gerar um link de redefinição de senha para ativa@x.com? Links anteriores deixam de valer.',
      ),
    ).toBeInTheDocument();
    expect(posted).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Gerar link' }));

    await waitFor(() =>
      expect(posted).toEqual(['/api/accounts/acc-9/reset-link']),
    );
    expect(await screen.findByLabelText('Link para ativa@x.com')).toHaveValue(
      LINK_URL,
    );
  });
});
