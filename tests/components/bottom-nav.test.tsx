// @vitest-environment jsdom

import { ThemeProvider } from '@still-void/ui/react/client';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MorePage from '@/app/(staff)/mais/page';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import type { UserRole } from '@/domain/auth/user-role';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const pathname = { current: '/' };
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function mockApi(role: UserRole, triagePhotos = 0) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.startsWith('/api/auth/identity')
      ? identityFor(role)
      : Array.from({ length: triagePhotos }, (_, i) => ({ id: `p${i}` }));
    return {
      ok: true,
      json: async () => ({ success: true, data, error: null }),
    };
  });
  vi.stubGlobal('fetch', fn);
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  pathname.current = '/';
});

describe('Feature: barra inferior do celular (#428)', () => {
  it('Dado o Profissional com 3 fotos na fila, Então Triagem mostra o contador', async () => {
    mockApi('profissional', 3);
    render(
      <WithStaffIdentity>
        <BottomNav />
      </WithStaffIdentity>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('3 fotos para avaliar')).toBeInTheDocument(),
    );
    expect(
      screen
        .getAllByRole('link')
        .map((a) => a.textContent?.replace(/\d+$/, '')),
    ).toEqual(['Hoje', 'Agenda', 'Triagem', 'Pacientes', 'Mais']);
  });

  it('Dado o Profissional com fila vazia, Então Triagem não mostra contador', async () => {
    mockApi('profissional', 0);
    render(
      <WithStaffIdentity>
        <BottomNav />
      </WithStaffIdentity>,
    );
    await settle();
    expect(screen.queryByLabelText(/fotos para avaliar/)).toBeNull();
  });

  it('Dado o Admin na Agenda, Então a barra é uma nav nomeada e marca a página atual', async () => {
    mockApi('company_admin');
    pathname.current = '/agenda/hoje';
    render(
      <WithStaffIdentity>
        <BottomNav />
      </WithStaffIdentity>,
    );
    await settle();
    expect(
      screen.getByRole('navigation', { name: 'Atalhos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agenda' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Hoje' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('link', { name: 'Faturas' })).toHaveAttribute(
      'href',
      '/faturamento',
    );
  });

  it('Dado a tela inicial, Então Hoje é o atalho ativo e Mais leva a /mais', async () => {
    mockApi('atendente');
    render(
      <WithStaffIdentity>
        <BottomNav />
      </WithStaffIdentity>,
    );
    await settle();
    expect(screen.getByRole('link', { name: 'Hoje' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Mais' })).toHaveAttribute(
      'href',
      '/mais',
    );
    expect(screen.queryByRole('link', { name: 'Faturas' })).toBeNull();
  });
});

describe('Feature: tela Mais (#428)', () => {
  it('Dado o Atendente, Então vê Parceiros e a conta, e nada de gestão', async () => {
    mockApi('atendente');
    render(
      <ThemeProvider>
        <WithStaffIdentity>
          <MorePage />
        </WithStaffIdentity>
      </ThemeProvider>,
    );
    await settle();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Mais' }),
    ).toBeInTheDocument();
    for (const name of ['Parceiros', 'Configurações', 'Minha conta']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Auditoria' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Gestão' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
