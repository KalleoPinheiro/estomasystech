// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { MajorityReviewCard } from '@/app/(staff)/majority-review-card';
import { ConsentCard } from '@/app/portal/consent-card';

import {
  DataRightsHarness,
  PartnerConsentHarness,
} from '../support/portal-harness';

vi.mock('@/app/portal/actions', async () =>
  (await import('../support/portal-actions')).portalActionsOverFetch(),
);

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

const partnerConsent = (overrides: Record<string, unknown> = {}) => ({
  partnerName: 'Dr. Indicador',
  consentText: 'Texto do parceiro',
  textVersion: 'v1',
  active: true,
  revoked: false,
  acceptedAt: '2026-01-01T12:00:00.000Z',
  acceptedVersion: 'v1',
  acceptedSource: 'portal',
  acceptedBy: null,
  revokedAt: null,
  revokedBy: null,
  signedByRelationship: null,
  representativeExpired: false,
  ...overrides,
});

describe('Feature: direitos do titular pelo representante do menor (#375)', () => {
  it('Dado o representante, Então baixa a cópia do paciente e só pede correção', async () => {
    const posts: unknown[] = [];
    mockFetch({
      'GET /api/portal/patient/data-requests': () => [],
      'POST /api/portal/patient/data-requests': (init) => {
        posts.push(JSON.parse(String(init?.body)));
        return { id: 'r-1' };
      },
    });

    renderWithToast(<DataRightsHarness asRepresentative />);

    expect(
      screen.getByRole('button', {
        name: 'Baixar cópia dos dados do paciente',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Pedir correção')).toBeInTheDocument();
    expect(screen.queryByText('Tipo de pedido')).not.toBeInTheDocument();
    expect(
      screen.getByText(/eliminação dos dados do paciente menor/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Telefone errado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() =>
      expect(posts).toEqual([
        { kind: 'correction', details: 'Telefone errado' },
      ]),
    );
  });

  it('Dado o próprio paciente, Então escolhe correção ou eliminação', async () => {
    mockFetch({ 'GET /api/portal/patient/data-requests': () => [] });
    renderWithToast(<DataRightsHarness />);
    expect(
      await screen.findByText('Pedir correção ou eliminação'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Baixar cópia dos meus dados' }),
    ).toBeInTheDocument();
  });
});

describe('Feature: autorização do parceiro dada pelo representante (#375)', () => {
  it('Dado o adulto com autorização do representante, Quando autoriza em nome próprio, Então grava', async () => {
    const calls: string[] = [];
    mockFetch({
      'GET /api/portal/patient/partner-consent': () =>
        partnerConsent({ signedByRelationship: 'mae' }),
      'POST /api/portal/patient/partner-consent': () => {
        calls.push('accept');
        return {};
      },
    });

    renderWithToast(<PartnerConsentHarness />);

    expect(
      await screen.findByText(/Autorizado pelo representante legal em/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Autorizar em meu nome' }),
    );
    await waitFor(() => expect(calls).toEqual(['accept']));
  });

  it('Dado o representante, Então não vê "Autorizar em meu nome"', async () => {
    mockFetch({
      'GET /api/portal/patient/partner-consent': () =>
        partnerConsent({ signedByRelationship: 'mae' }),
    });
    renderWithToast(<PartnerConsentHarness asRepresentative />);
    expect(
      await screen.findByText(/Autorizado pelo representante legal/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Autorizar em meu nome' }),
    ).not.toBeInTheDocument();
  });

  it('Dado a autorização do representante vencida, Então explica e pede nova', async () => {
    mockFetch({
      'GET /api/portal/patient/partner-consent': () =>
        partnerConsent({
          active: false,
          signedByRelationship: 'mae',
          representativeExpired: true,
        }),
    });
    renderWithToast(<PartnerConsentHarness />);
    expect(
      await screen.findByText(/venceu 90 dias depois dos seus 18 anos/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Li e autorizo' }),
    ).toBeInTheDocument();
  });
});

describe('Feature: termo aceito pelo representante vencido (#375)', () => {
  const expired = {
    consentText: 'Termo',
    accepted: false,
    acceptedAt: null,
    canSign: true,
    signedByRelationship: 'mae',
    representativeExpired: true,
  };

  it('Dado o paciente, Então explica o vencimento', () => {
    renderWithToast(<ConsentCard status={expired} onAccepted={() => {}} />);
    expect(
      screen.getByText(/venceu 90 dias depois dos seus 18 anos/),
    ).toBeInTheDocument();
  });

  it('Dado o representante, Então não mostra o aviso do paciente', () => {
    renderWithToast(
      <ConsentCard status={expired} onAccepted={() => {}} asRepresentative />,
    );
    expect(
      screen.queryByText(/venceu 90 dias depois dos seus 18 anos/),
    ).not.toBeInTheDocument();
  });
});

describe('Feature: aviso à clínica do aceite do representante (#375)', () => {
  const base = {
    patientId: 'pat-9',
    fullName: 'Gabi Adulta',
    birthDate: '2008-01-01T00:00:00.000Z',
    guardianName: 'Paula Mãe',
    guardianRelationship: 'mae',
    awaitingTransfer: false,
  };

  it('Mostra o prazo vigente e o vencido, sem "Manter" para quem já tem conta', async () => {
    mockFetch({
      'GET /api/guardians/majority': () => [
        {
          ...base,
          representativeConsentExpiresOn: '2026-11-30T00:00:00.000Z',
          representativeConsentExpired: false,
        },
        {
          ...base,
          patientId: 'pat-10',
          fullName: 'Hugo Vencido',
          representativeConsentExpiresOn: '2026-04-01T00:00:00.000Z',
          representativeConsentExpired: true,
        },
      ],
    });

    renderWithToast(<MajorityReviewCard />);

    expect(
      await screen.findByText('O aceite do responsável vence em 30/11/2026.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/venceu em 01\/04\/2026: peça ao paciente/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/nascido\(a\) em 01\/01\/2008/)).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Manter com o responsável' }),
    ).not.toBeInTheDocument();
  });
});
