// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { renderServerPage } from '@/../tests/support/server-page';
import PortalPage from '@/app/portal/page';

import {
  GuardianPortalHarness,
  PatientPortalHarness,
} from '../support/portal-harness';

vi.mock('next/navigation', async () =>
  (await import('../support/portal-router')).navigationMock(),
);

type Handler = (init?: RequestInit) => unknown;

function mockFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const key = `${init?.method ?? 'GET'} ${url}`;
      const handler = routes[key];
      if (!handler) throw new Error(`URL não mapeada no mock: ${key}`);
      const data = handler(init);
      return {
        ok: true,
        json: async () => ({ success: true, data, error: null }),
      };
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseBundle = {
  patient: {
    id: 'pat-1',
    fullName: 'Luiza Filha',
    email: null,
    phone: '11999990000',
  },
  appointments: [],
  conditions: [],
  invoices: [],
  followUps: [],
  actingFor: null,
  guardianAccess: null,
};

const consentPending = {
  consentText: 'Termo',
  accepted: false,
  acceptedAt: null,
};

const guardianPage = vi.hoisted(() => ({
  signedIn: vi.fn(),
  patientPage: vi.fn(),
  represented: vi.fn(),
}));

vi.mock('@/lib/server/session', () => ({
  requireSignedInPage: guardianPage.signedIn,
  requirePatientPortalPage: guardianPage.patientPage,
}));
vi.mock('@/lib/server/data/portal', () => ({
  loadRepresentedPatients: guardianPage.represented,
  loadPatientPortalView: vi.fn(),
  loadPartnerPortal: vi.fn(),
}));

describe('Feature: Portal do responsável (ADR-027)', () => {
  // TESTE-ALTERADO (#553, ADR-081): a página é Server Component; o papel vem da
  // sessão e a lista de representados chega pela camada de dados. Mesmo cenário.
  it('Dado papel guardian, Quando abrir o portal, Então mostra a visão do responsável', async () => {
    const session = { subject: 'ana@x.com', role: 'guardian' };
    guardianPage.signedIn.mockResolvedValue(session);
    guardianPage.patientPage.mockResolvedValue(session);
    guardianPage.represented.mockResolvedValue({
      patients: [],
      selectedPatientId: null,
    });

    await renderServerPage(() => PortalPage());

    expect(
      await screen.findByText(/Nenhum paciente está ligado ao seu acesso/),
    ).toBeInTheDocument();
  });

  it('Dado vários pacientes sem escolha, Quando escolher um, Então grava a escolha e mostra o aviso "em nome de"', async () => {
    let selected: string | null = null;
    const fetchMock = mockFetch({
      'GET /api/portal/guardian/patients': () => ({
        patients: [
          { id: 'pat-1', fullName: 'Luiza Filha' },
          { id: 'pat-2', fullName: 'Pedro Filho' },
        ],
        selectedPatientId: selected,
      }),
      'PUT /api/portal/guardian/acting-for': (init) => {
        selected = JSON.parse(String(init?.body)).patientId;
        return { patientId: selected };
      },
      'GET /api/portal/patient': () => ({
        ...baseBundle,
        actingFor: { patientId: 'pat-1', fullName: 'Luiza Filha' },
      }),
      'GET /api/portal/patient/consent': () => consentPending,
      'GET /api/portal/patient/consent?purpose=image': () => consentPending,
    });

    renderWithToast(<GuardianPortalHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Luiza Filha' }));

    expect(
      await screen.findByText('Acessando em nome de Luiza Filha.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Trocar paciente' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Luiza Filha' }),
    ).toBeInTheDocument();
    // Atos do titular não aparecem: nem aceite do termo, nem LGPD.
    expect(
      screen.queryByRole('button', { name: 'Li e aceito o termo' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Meus dados (LGPD)')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Os termos de consentimento \(tratamento e imagem\)/),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/guardian/acting-for',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('Dado dois pacientes e um escolhido, Quando clicar em Trocar paciente, Então limpa a escolha', async () => {
    let selected: string | null = 'pat-1';
    mockFetch({
      'GET /api/portal/guardian/patients': () => ({
        patients: [
          { id: 'pat-1', fullName: 'Luiza Filha' },
          { id: 'pat-2', fullName: 'Pedro Filho' },
        ],
        selectedPatientId: selected,
      }),
      'DELETE /api/portal/guardian/acting-for': () => {
        selected = null;
        return { patientId: null };
      },
      'GET /api/portal/patient': () => ({
        ...baseBundle,
        actingFor: { patientId: 'pat-1', fullName: 'Luiza Filha' },
      }),
      'GET /api/portal/patient/consent': () => ({
        ...consentPending,
        accepted: true,
      }),
      'GET /api/portal/patient/consent?purpose=image': () => ({
        ...consentPending,
        accepted: true,
      }),
    });

    renderWithToast(<GuardianPortalHarness />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Trocar paciente' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Em nome de quem você acessa?',
      }),
    ).toBeInTheDocument();
  });

  it('Dado erro na API, Quando carregar os pacientes, Então mostra o erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ success: false, data: null, error: 'Falhou' }),
      })),
    );

    renderWithToast(<GuardianPortalHarness />);

    await waitFor(() => expect(screen.getByText(/Falhou/)).toBeInTheDocument());
  });
});

describe('Feature: Paciente vê quem acessa em nome dele (ADR-027)', () => {
  const access = {
    fullName: 'Ana Responsável',
    relationshipLabel: 'Filho(a)',
  };

  it.each([
    [null, 'Ainda não houve acesso.'],
    ['2026-10-17T12:00:00.000Z', /Último acesso em/],
  ])(
    'Dado responsável com acesso (último %s), Quando o paciente abre o portal, Então vê o aviso',
    async (lastAccessAt, expected) => {
      mockFetch({
        'GET /api/portal/patient': () => ({
          ...baseBundle,
          guardianAccess: { ...access, lastAccessAt },
        }),
        'GET /api/portal/patient/consent': () => ({
          ...consentPending,
          accepted: true,
        }),
        'GET /api/portal/patient/consent?purpose=image': () => ({
          ...consentPending,
          accepted: true,
        }),
        'GET /api/portal/patient/partner-consent': () => ({}),
        'GET /api/portal/patient/data-requests': () => [],
      });

      renderWithToast(<PatientPortalHarness />);

      expect(
        await screen.findByText(/pode acessar este portal em seu nome/),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Ana Responsável (Filho(a))'),
      ).toBeInTheDocument();
      expect(screen.getByText(expected, { exact: false })).toBeInTheDocument();
    },
  );

  it('Dado responsável com acesso, Quando o paciente confirma "Encerrar acesso", Então chama a API e recarrega', async () => {
    const calls: string[] = [];
    mockFetch({
      'GET /api/portal/patient': () => ({
        ...baseBundle,
        guardianAccess: { ...access, lastAccessAt: null },
      }),
      'GET /api/portal/patient/consent': () => ({
        ...consentPending,
        accepted: true,
      }),
      'GET /api/portal/patient/partner-consent': () => ({}),
      'GET /api/portal/patient/data-requests': () => [],
      'DELETE /api/portal/patient/guardian-access': () => {
        calls.push('revoke');
        return { revoked: true };
      },
    });

    renderWithToast(<PatientPortalHarness />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar acesso' }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Encerrar acesso',
      }),
    );

    await waitFor(() => expect(calls).toEqual(['revoke']));
  });

  it('Dado falha na API, Quando confirmar "Encerrar acesso", Então mostra o erro e não recarrega', async () => {
    mockFetch({
      'GET /api/portal/patient': () => ({
        ...baseBundle,
        guardianAccess: { ...access, lastAccessAt: null },
      }),
      'GET /api/portal/patient/consent': () => ({
        ...consentPending,
        accepted: true,
      }),
      'GET /api/portal/patient/partner-consent': () => ({}),
      'GET /api/portal/patient/data-requests': () => [],
      'DELETE /api/portal/patient/guardian-access': () => {
        throw new Error('Falha ao encerrar');
      },
    });

    renderWithToast(<PatientPortalHarness />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar acesso' }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Encerrar acesso',
      }),
    );

    expect(await screen.findByText('Falha ao encerrar')).toBeInTheDocument();
  });
});
