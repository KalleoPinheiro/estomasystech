// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartnerConsentPanel } from '@/app/(staff)/pacientes/[id]/partner-consent-panel';
import { PartnerConsentSection } from '@/app/portal/partner-consent-card';
import type { PartnerShareConsentDto } from '@/lib/dto';
import { renderWithToast } from '../support/render-with-toast';

const base: PartnerShareConsentDto = {
  partnerName: 'Dra. Parceira',
  consentText: 'Texto provisório do consentimento',
  textVersion: 'v0-placeholder',
  active: false,
  revoked: false,
  acceptedAt: null,
  acceptedVersion: null,
  revokedAt: null,
  revokedBy: null,
};

const ACCEPTED_AT = '2026-05-01T12:00:00.000Z';
const active: PartnerShareConsentDto = {
  ...base,
  active: true,
  acceptedAt: ACCEPTED_AT,
  acceptedVersion: 'v0-placeholder',
};

const envelope = (data: unknown, ok = true, error: string | null = null) => ({
  ok,
  json: async () => ({ success: ok, data, error }),
});

/**
 * GET devolve os status em sequência (o último se repete); POST responde
 * `postOk`. Guarda as chamadas para conferir rota e método.
 */
function mockConsentApi(
  statuses: Array<PartnerShareConsentDto | null>,
  postOk = true,
) {
  const calls: Array<{ url: string; method: string }> = [];
  let index = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (method === 'POST') {
        return postOk
          ? envelope({ active: !url.endsWith('/revoke') })
          : envelope(null, false, 'Falha ao registrar');
      }
      const status = statuses[Math.min(index, statuses.length - 1)];
      index += 1;
      return envelope(status);
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Consentimento para o parceiro no portal do paciente (#292)', () => {
  it('Dado paciente sem parceiro indicador (null), Então não mostra nada', async () => {
    const calls = mockConsentApi([null]);

    renderWithToast(<PartnerConsentSection />);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByText(/Compartilhar com/)).not.toBeInTheDocument();
  });

  it('Dado sem autorização, Quando clicar "Li e autorizo", Então POST no portal e recarrega o status', async () => {
    const calls = mockConsentApi([base, active]);

    renderWithToast(<PartnerConsentSection />);

    expect(
      await screen.findByText('Compartilhar com Dra. Parceira'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Texto provisório do consentimento'),
    ).toBeInTheDocument();
    expect(screen.getByText('Você ainda não autorizou.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Li e autorizo' }));

    expect(await screen.findByText(/Autorizado em/)).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: '/api/portal/patient/partner-consent',
      method: 'POST',
    });
  });

  it('Dado autorizado, Quando revogar e confirmar, Então POST de revogação', async () => {
    const calls = mockConsentApi([
      active,
      { ...base, revoked: true, revokedAt: ACCEPTED_AT, revokedBy: 'patient' },
    ]);

    renderWithToast(<PartnerConsentSection />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Revogar autorização' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revogar' }));

    expect(
      await screen.findByText(/Autorização revogada em/),
    ).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: '/api/portal/patient/partner-consent/revoke',
      method: 'POST',
    });
  });

  it('Dado falha no POST, Então mostra o erro', async () => {
    mockConsentApi([base], false);

    renderWithToast(<PartnerConsentSection />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Li e autorizo' }),
    );

    expect(
      (await screen.findAllByText('Falha ao registrar')).length,
    ).toBeGreaterThan(0);
  });
});

describe('Feature: Consentimento para o parceiro na ficha do paciente (#292)', () => {
  it('Dado paciente sem parceiro indicador (null), Então o painel não aparece', async () => {
    const calls = mockConsentApi([null]);

    renderWithToast(<PartnerConsentPanel patientId="p1" />);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByText(/parceiro indicador/)).not.toBeInTheDocument();
  });

  it.each([
    [base, 'O paciente não autorizou. O parceiro vê só se ele foi atendido.'],
    [
      {
        ...base,
        revoked: true,
        revokedAt: ACCEPTED_AT,
        revokedBy: 'staff' as const,
      },
      /Revogado pela equipe em/,
    ],
    [
      { ...base, revoked: true, revokedAt: ACCEPTED_AT, revokedBy: null },
      /^Revogado em/,
    ],
    [
      { ...base, acceptedAt: ACCEPTED_AT, acceptedVersion: 'v-antiga' },
      /O texto do consentimento mudou/,
    ],
  ])(
    'Dado status %#, Então descreve sem botão de revogar',
    async (status, text) => {
      mockConsentApi([status]);

      renderWithToast(<PartnerConsentPanel patientId="p1" />);

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByText('Não autorizado')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Revogar a pedido do paciente' }),
      ).not.toBeInTheDocument();
    },
  );

  it('Dado autorizado, Quando a equipe revoga e confirma, Então POST na rota da ficha', async () => {
    const calls = mockConsentApi([
      active,
      { ...base, revoked: true, revokedAt: ACCEPTED_AT, revokedBy: 'staff' },
    ]);

    renderWithToast(<PartnerConsentPanel patientId="p1" />);

    expect(
      await screen.findByText(/Autorizado pelo paciente em/),
    ).toBeInTheDocument();
    expect(screen.getByText(/texto v0-placeholder/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Revogar a pedido do paciente' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revogar' }));

    expect(
      await screen.findByText(/Revogado pela equipe em/),
    ).toBeInTheDocument();
    expect(calls).toContainEqual({
      url: '/api/patients/p1/partner-consent/revoke',
      method: 'POST',
    });
  });

  it('Dado falha ao revogar, Então mostra o erro', async () => {
    mockConsentApi([active], false);

    renderWithToast(<PartnerConsentPanel patientId="p1" />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Revogar a pedido do paciente',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revogar' }));

    expect(
      (await screen.findAllByText('Falha ao registrar')).length,
    ).toBeGreaterThan(0);
  });
});
