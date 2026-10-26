// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { StaffIdentityProvider } from '@/lib/staff-access';
import { identityFor } from '../support/staff-identity';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const withProfissional = (node: React.ReactNode) => (
  <StaffIdentityProvider initialIdentity={identityFor('profissional')}>
    {node}
  </StaffIdentityProvider>
);

describe('Feature: contador de triagem da barra do celular vem do servidor (#549)', () => {
  it('Dado o contador contado no servidor, Quando a barra monta, Então mostra o número sem chamar /api/photos/triage', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(withProfissional(<BottomNav triageCount={3} />));
    await act(async () => {});

    expect(screen.getByLabelText('3 fotos para avaliar')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado o contador zero vindo do servidor, Quando a barra monta, Então não mostra selo e também não busca a fila', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(withProfissional(<BottomNav triageCount={0} />));
    await act(async () => {});

    expect(screen.queryByLabelText(/fotos para avaliar/)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado que o servidor não conseguiu contar, Quando a barra monta, Então busca a fila como antes', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [{ id: 'a' }, { id: 'b' }],
        error: null,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(withProfissional(<BottomNav />));

    expect(
      await screen.findByLabelText('2 fotos para avaliar'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/photos/triage',
      expect.anything(),
    );
  });
});
