// @vitest-environment jsdom

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '@/app/(staff)/configuracoes/page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const ACCOUNT = {
  id: 'acc-1',
  email: 'ana@x.com',
  role: 'atendente',
  clinicId: 'c1',
  professionalId: null,
  active: true,
  passwordSet: true,
};
const PORTAL_ACCOUNT = {
  ...ACCOUNT,
  id: 'acc-2',
  email: 'maria@x.com',
  role: 'patient',
};

/** `channel` ausente = o endpoint do canal não responde; `null` = clínica sem canal. */
function mockFetch(channel: unknown | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/settings/email-channel')) {
        return channel === undefined
          ? {
              ok: false,
              status: 500,
              json: async () => ({ success: false, data: null, error: 'x' }),
            }
          : ok({ channel });
      }
      if (url.startsWith('/api/settings/schedule/closures')) return ok([]);
      if (url.startsWith('/api/settings/schedule'))
        return ok({
          config: {
            weekdays: [],
            startHour: 8,
            endHour: 18,
            minGapMinutes: 30,
          },
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
      if (url.startsWith('/api/accounts')) return ok([ACCOUNT, PORTAL_ACCOUNT]);
      if (url.startsWith('/api/professionals')) return ok([]);
      return ok(null);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const openForm = async () => {
  renderWithToast(<SettingsPage />);
  await screen.findByText('ana@x.com');
  fireEvent.click(screen.getByText('+ Nova conta'));
};

describe('Feature: Contas de acesso mais claras (#475)', () => {
  it('Dadas contas de equipe e de portal, Quando a tabela abrir, Então cada linha mostra o papel', async () => {
    mockFetch(null);
    renderWithToast(<SettingsPage />);

    const row = (await screen.findByText('maria@x.com')).closest(
      'tr',
    ) as HTMLElement;
    expect(
      screen.getByRole('columnheader', { name: 'Papel' }),
    ).toBeInTheDocument();
    expect(within(row).getByText('Paciente')).toBeInTheDocument();
    const staffRow = screen.getByText('ana@x.com').closest('tr') as HTMLElement;
    expect(within(staffRow).getByText('Atendente')).toBeInTheDocument();
  });

  it('Quando abrir Nova conta, Então o papel padrão é o de menor privilégio, não Admin de Empresa', async () => {
    mockFetch(null);
    await openForm();

    expect(screen.getByLabelText(/Papel/)).toHaveValue('atendente');
  });

  it('Dada clínica sem canal de e-mail, Quando abrir Nova conta, Então o texto diz que o link aparece para copiar', async () => {
    mockFetch(null);
    await openForm();

    expect(
      await screen.findByText(/não tem canal de e-mail/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/recebe um e-mail de convite/),
    ).not.toBeInTheDocument();
  });

  it('Dada clínica com canal, Quando abrir Nova conta, Então o texto promete o e-mail de convite', async () => {
    mockFetch({ provider: 'resend', sender: 'a@b.com', secretLast4: '1234' });
    await openForm();

    expect(
      await screen.findByText(/recebe um e-mail de convite/),
    ).toBeInTheDocument();
  });

  it('Dado canal que não respondeu, Quando abrir Nova conta, Então o texto não afirma nada sobre o e-mail', async () => {
    mockFetch(undefined);
    await openForm();

    expect(
      screen.getByText(
        /Ele sai por e-mail quando a clínica tem canal configurado/,
      ),
    ).toBeInTheDocument();
  });
});
