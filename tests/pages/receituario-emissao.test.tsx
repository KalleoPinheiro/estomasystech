// @vitest-environment jsdom

import { ToastProvider } from '@still-void/ui/react/client';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrescriptionsSection } from '@/app/(staff)/pacientes/[id]/prescriptions-section';

/** Emissão do receituário na tela do plano (#956, ADR-116). */

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});
const failure = (error: string) => ({
  ok: false,
  status: 400,
  json: async () => ({ success: false, data: null, error }),
});

const renderSection = () =>
  render(
    <ToastProvider>
      <PrescriptionsSection planId="plano-1" />
    </ToastProvider>,
  );

const ISSUED = {
  id: 'rct-1',
  documentNumber: 'RCT-AAAA1111',
  issuedAt: '2026-11-22T12:00:00.000Z',
};

function mockFetch(post: unknown, listed: unknown[] = []) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? post : ok(listed),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Feature: emitir receituário pela tela do plano (#956, ADR-116)', () => {
  it('Dado plano com receituário emitido, Quando abre, Então lista o número com link de download', async () => {
    mockFetch(ok(ISSUED), [ISSUED]);

    renderSection();

    const link = await screen.findByRole('link', { name: 'RCT-AAAA1111' });
    expect(link.getAttribute('href')).toBe(
      '/api/care-plans/plano-1/receituarios/rct-1',
    );
  });

  it('Dadas observações, Quando emite, Então envia o texto aparado e baixa o PDF emitido', async () => {
    const fetchMock = mockFetch(ok(ISSUED));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderSection();

    fireEvent.change(screen.getByLabelText('Observações (opcional)'), {
      target: { value: '  Manter a pele seca.  ' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Emitir receituário (PDF)' }),
    );

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        '/api/care-plans/plano-1/receituarios/rct-1',
        '_self',
      ),
    );
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    );
    expect(post?.[0]).toBe('/api/care-plans/plano-1/receituarios');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      freeText: 'Manter a pele seca.',
    });
  });

  it('Dada recusa do servidor, Quando emite sem observações, Então mostra o erro e não baixa', async () => {
    const fetchMock = mockFetch(failure('Complete os dados cadastrais'));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderSection();

    fireEvent.click(
      screen.getByRole('button', { name: 'Emitir receituário (PDF)' }),
    );

    expect(
      await screen.findByText('Complete os dados cadastrais'),
    ).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    const post = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    );
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ freeText: null });
  });
});
