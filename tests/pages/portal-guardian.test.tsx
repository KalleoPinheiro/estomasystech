// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { GuardianPortalView } from '@/app/portal/guardian-view';
import PortalPage from '@/app/portal/page';
import { PatientPortalView } from '@/app/portal/patient-view';

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

describe('Feature: Portal do responsável (ADR-027)', () => {
  it('Dado papel guardian, Quando abrir o portal, Então mostra a visão do responsável', async () => {
    mockFetch({
      'GET /api/portal/me': () => ({ subject: 'ana@x.com', role: 'guardian' }),
      'GET /api/portal/guardian/patients': () => ({
        patients: [],
        selectedPatientId: null,
      }),
    });

    renderWithToast(<PortalPage />);

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
    });

    renderWithToast(<GuardianPortalView />);
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
      screen.getByText(/O termo de consentimento ainda não foi aceito/),
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
    });

    renderWithToast(<GuardianPortalView />);
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

    renderWithToast(<GuardianPortalView />);

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
        'GET /api/portal/patient/partner-consent': () => ({}),
        'GET /api/portal/patient/data-requests': () => [],
      });

      renderWithToast(<PatientPortalView />);

      expect(
        await screen.findByText(/pode acessar este portal em seu nome/),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Ana Responsável (Filho(a))'),
      ).toBeInTheDocument();
      expect(screen.getByText(expected, { exact: false })).toBeInTheDocument();
    },
  );
});
