// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
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

/** Responde a tudo que a tela de configurações carrega e captura o POST de conta. */
function mockSettingsFetch(posted: unknown[]) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/accounts' && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)));
      return ok({ id: 'acc-1', email: 'x', delivered: true });
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
    if (url.startsWith('/api/accounts')) return ok([]);
    if (url.startsWith('/api/professionals')) return ok([]);
    return ok(null);
  });
  vi.stubGlobal('fetch', fn);
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
