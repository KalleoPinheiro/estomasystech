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
import { MajorityReviewCard } from '@/app/(staff)/majority-review-card';

import { PatientPortalHarness } from '../support/portal-harness';

vi.mock('@/app/portal/actions', async () =>
  (await import('../support/portal-actions')).portalActionsOverFetch(),
);

vi.mock('next/navigation', async () =>
  (await import('../support/portal-router')).navigationMock(),
);

type Handler = (init?: RequestInit) => unknown;

function mockFetch(routes: Record<string, Handler>, failing: string[] = []) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const key = `${init?.method ?? 'GET'} ${url}`;
      if (failing.includes(key)) {
        return {
          ok: false,
          json: async () => ({ success: false, data: null, error: 'Falhou' }),
        };
      }
      const handler = routes[key];
      if (!handler) throw new Error(`URL não mapeada no mock: ${key}`);
      return {
        ok: true,
        json: async () => ({ success: true, data: handler(init), error: null }),
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

const bundle = (actingFor: boolean) => ({
  patient: {
    id: 'pat-1',
    fullName: 'Davi Menor',
    email: null,
    phone: '11999990000',
  },
  appointments: [],
  conditions: [],
  invoices: [],
  followUps: [],
  actingFor: actingFor ? { patientId: 'pat-1', fullName: 'Davi Menor' } : null,
  guardianAccess: null,
});

const consent = (overrides: Record<string, unknown>) => ({
  consentText: 'Termo',
  accepted: false,
  acceptedAt: null,
  canSign: true,
  signedByRelationship: null,
  ...overrides,
});

const portalRoutes = (
  actingFor: boolean,
  status: Record<string, unknown>,
  extra: Record<string, Handler> = {},
) => ({
  'GET /api/portal/patient': () => bundle(actingFor),
  'GET /api/portal/patient/consent': () => consent(status),
  'GET /api/portal/patient/consent?purpose=image': () => consent(status),
  'GET /api/portal/privacy-notice': () => ({ version: 'v2', text: 'AVISO' }),
  'GET /api/portal/patient/partner-consent': () => ({}),
  'GET /api/portal/patient/data-requests': () => [],
  ...extra,
});

describe('Feature: Representante legal assina pelo menor (#372)', () => {
  it('Dado menor representado, Quando a mãe abre o portal, Então vê o aviso e os termos para aceitar', async () => {
    const calls: string[] = [];
    mockFetch(
      portalRoutes(
        true,
        {},
        {
          'POST /api/portal/patient/consent?purpose=treatment': () => {
            calls.push('treatment');
            return { accepted: true };
          },
        },
      ),
    );

    renderWithToast(<PatientPortalHarness />);

    expect(
      await screen.findByText(/Como representante legal, você lê e aceita/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByLabelText('Li e concordo com o termo de tratamento'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Li e aceito o termo de tratamento' }),
    );
    await waitFor(() => expect(calls).toEqual(['treatment']));
  });

  it('Dado adulto representado, Quando o responsável abre o portal, Então só lê o estado (sem assinar)', async () => {
    mockFetch(portalRoutes(true, { canSign: false }));

    renderWithToast(<PatientPortalHarness />);

    expect(
      await screen.findByText(/Eles são aceitos pelo próprio paciente/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Li e aceito/ }),
    ).not.toBeInTheDocument();
  });

  it('Dado termo aceito pela mãe, Quando o representante vê, Então não oferece "Aceitar em meu nome"', async () => {
    mockFetch(
      portalRoutes(true, {
        accepted: true,
        acceptedAt: '2026-10-18T12:00:00.000Z',
        signedByRelationship: 'mae',
      }),
    );

    renderWithToast(<PatientPortalHarness />);

    expect(
      (await screen.findAllByText(/pelo representante legal/)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Aceitar em meu nome' }),
    ).not.toBeInTheDocument();
  });

  it('Dado paciente que fez 18 anos, Quando aceita em nome próprio, Então registra; erro vira aviso', async () => {
    const calls: string[] = [];
    mockFetch(
      portalRoutes(
        false,
        { accepted: true, signedByRelationship: 'mae' },
        {
          'POST /api/portal/patient/consent?purpose=treatment': () => {
            calls.push('treatment');
            return { accepted: true };
          },
        },
      ),
      ['POST /api/portal/patient/consent?purpose=image'],
    );

    renderWithToast(<PatientPortalHarness />);

    const buttons = await screen.findAllByRole('button', {
      name: 'Aceitar em meu nome',
    });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(calls).toEqual(['treatment']));
    fireEvent.click(buttons[1]);
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });
});

describe('Feature: Aviso de maioridade no painel (#372)', () => {
  const item = {
    patientId: 'pat-9',
    fullName: 'Fábio Fez 18',
    birthDate: '2008-10-18T00:00:00.000Z',
    guardianName: 'Paulo Pai',
    guardianRelationship: 'pai',
  };

  it('Dado ninguém na lista, Então o cartão não aparece', async () => {
    const fetchMock = mockFetch({ 'GET /api/guardians/majority': () => [] });
    renderWithToast(<MajorityReviewCard />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/fizeram 18 anos/)).not.toBeInTheDocument(),
    );
  });

  it('Dado paciente que fez 18, Quando "Manter com o responsável", Então grava e recarrega', async () => {
    const calls: string[] = [];
    mockFetch({
      'GET /api/guardians/majority': () => (calls.length ? [] : [item]),
      'POST /api/guardians/majority/pat-9/keep': () => {
        calls.push('keep');
        return { patientId: 'pat-9' };
      },
    });

    renderWithToast(<MajorityReviewCard />);

    expect(
      await screen.findByText('Pacientes que fizeram 18 anos (1)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Paulo Pai \(Pai\)/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Manter com o responsável' }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Manter',
      }),
    );
    await waitFor(() => expect(calls).toEqual(['keep']));
  });

  it('Dado falha ao manter, Então mostra o erro', async () => {
    mockFetch(
      {
        'GET /api/guardians/majority': () => [
          { ...item, birthDate: null, guardianRelationship: 'desconhecido' },
        ],
      },
      ['POST /api/guardians/majority/pat-9/keep'],
    );

    renderWithToast(<MajorityReviewCard />);

    expect(
      await screen.findByText(/Paulo Pai \(desconhecido\)/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Manter com o responsável' }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Manter',
      }),
    );
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
  });
});
