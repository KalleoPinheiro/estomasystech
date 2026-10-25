// @vitest-environment jsdom

import { ThemeProvider } from '@still-void/ui/react/client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MorePage from '@/app/(staff)/mais/page';
import type { UserRole } from '@/domain/auth/user-role';

const requireStaffPage = vi.fn();
vi.mock('@/lib/server/session', () => ({
  requireStaffPage: (...args: unknown[]) => requireStaffPage(...args),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/mais',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  requireStaffPage.mockReset();
});

async function renderFor(role: UserRole) {
  requireStaffPage.mockResolvedValue({ role });
  const page = await MorePage();
  render(<ThemeProvider>{page}</ThemeProvider>);
}

describe('Feature: tela Mais renderizada no servidor (#544, ADR-069)', () => {
  it('Dado o admin da clínica, Quando a página renderiza, Então vê gestão e auditoria já no HTML, sem fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await renderFor('company_admin');

    expect(screen.getByRole('link', { name: 'Auditoria' })).toHaveAttribute(
      'href',
      '/auditoria',
    );
    expect(screen.getByRole('heading', { name: 'Gestão' })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('Dado o Profissional, Quando a página renderiza, Então não vê os itens administrativos (Auditoria, Faturas, Repasses de gestão)', async () => {
    await renderFor('profissional');

    expect(screen.queryByRole('link', { name: 'Auditoria' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Faturamento' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Minha conta' }),
    ).toBeInTheDocument();
  });

  it('Dado o Atendente, Quando a página renderiza, Então não vê a auditoria', async () => {
    await renderFor('atendente');

    expect(screen.queryByRole('link', { name: 'Auditoria' })).toBeNull();
  });

  it('Dada a página, Então a guarda é pedida com a volta ao próprio endereço para o login', async () => {
    await renderFor('company_admin');

    expect(requireStaffPage).toHaveBeenCalledWith({ next: '/mais' });
  });

  it('Dada sessão que a guarda recusa, Quando a página renderiza, Então o erro da guarda sobe e nada é desenhado', async () => {
    requireStaffPage.mockRejectedValue(new Error('REDIRECT /login'));

    await expect(MorePage()).rejects.toThrow('REDIRECT /login');
  });
});
