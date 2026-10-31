// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PartnerPortalHarness } from '../support/portal-harness';

vi.mock('next/navigation', async () =>
  (await import('../support/portal-router')).navigationMock(),
);

function mockPartner(crm: string | null, specialty: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        error: null,
        data: {
          partner: {
            id: 'partner-1',
            fullName: 'Dr. Carlos Lima',
            email: 'carlos@parceiro.com',
            phone: '11988880000',
            crm,
            specialty,
            active: true,
          },
          referredPatients: [],
        },
      }),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Cabeçalho do portal do parceiro sem separador solto', () => {
  it('Dado parceiro sem CRM e com especialidade, Quando abrir o portal, Então o texto não começa com "·"', async () => {
    mockPartner(null, 'Estomaterapia');
    render(<PartnerPortalHarness />);
    expect(
      await screen.findByText(/^Estomaterapia — acompanhamento dos pacientes/),
    ).toBeInTheDocument();
  });

  it('Dado parceiro com CRM e sem especialidade, Quando abrir o portal, Então não sobra "·" depois do CRM', async () => {
    mockPartner('CRM-SP 12345', null);
    render(<PartnerPortalHarness />);
    expect(
      await screen.findByText(/^CRM-SP 12345 — acompanhamento/),
    ).toBeInTheDocument();
  });

  it('Dado parceiro com CRM e especialidade, Quando abrir o portal, Então os dois aparecem separados por "·"', async () => {
    mockPartner('CRM-SP 12345', 'Estomaterapia');
    render(<PartnerPortalHarness />);
    expect(
      await screen.findByText(/^CRM-SP 12345 · Estomaterapia — acompanhamento/),
    ).toBeInTheDocument();
  });

  it('Dado parceiro sem CRM nem especialidade, Quando abrir o portal, Então o texto começa direto em "acompanhamento"', async () => {
    mockPartner(null, null);
    render(<PartnerPortalHarness />);
    expect(
      await screen.findByText(/^acompanhamento dos pacientes/),
    ).toBeInTheDocument();
  });
});
