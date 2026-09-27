// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformLayout from '@/app/plataforma/layout';
import PlatformPage from '@/app/plataforma/page';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/plataforma',
}));

describe('Feature: Área da plataforma (B1, ADR-007)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dado o super_admin em /plataforma, Quando renderizar, Então mostra título Plataforma e botão Sair, sem sidebar da equipe', () => {
    render(
      <PlatformLayout>
        <PlatformPage />
      </PlatformLayout>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Plataforma' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Pacientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
  });

  it('Dado o botão Sair, Quando clicar, Então encerra a sessão e leva a /login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PlatformLayout>
        <PlatformPage />
      </PlatformLayout>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
    });
  });
});
