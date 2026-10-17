// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoleGate } from '@/app/(staff)/role-gate';
import { StaffNav } from '@/app/(staff)/staff-nav';
import type { UserRole } from '@/domain/auth/user-role';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const pathname = { current: '/' };
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

function mockIdentity(role: UserRole) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/auth/identity')) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: identityFor(role),
          error: null,
        }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const renderNav = async (role: UserRole) => {
  const fetchMock = mockIdentity(role);
  render(
    <WithStaffIdentity>
      <StaffNav />
    </WithStaffIdentity>,
  );
  // A identidade precisa ter chegado: para o Atendente o menu "carregando"
  // (só telas abertas a toda a equipe) coincide com o final.
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  await act(async () => {
    const response = await fetchMock.mock.results[0]?.value;
    await response?.json();
  });
  return screen.getAllByRole('link').map((a) => a.textContent);
};

const ADMIN_ONLY = [
  'Faturamento',
  'Procedimentos',
  'Materiais',
  'Relatórios',
  'Auditoria',
  'Pedidos do titular',
  'Profissionais',
];

/** Issue #199: o menu era o mesmo para todos os papéis (telas 403). */
describe('Feature: menu por papel (#199)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    pathname.current = '/';
  });

  it('C36 atendente vê só itens permitidos', async () => {
    const labels = await renderNav('atendente');

    // Configurações: só Feriados e ausências (#215).
    expect(labels).toEqual([
      'Dashboard',
      'Agenda',
      'Pacientes',
      'Parceiros',
      'Configurações',
      'Minha conta',
    ]);
    for (const hidden of [...ADMIN_ONLY, 'Repasses', 'Triagem']) {
      expect(labels).not.toContain(hidden);
    }
  });

  it('C37 profissional vê triagem e não vê administrativos', async () => {
    const labels = await renderNav('profissional');

    expect(labels).toContain('Triagem');
    expect(labels).toContain('Repasses');
    expect(labels).toContain('Configurações');
    for (const hidden of ADMIN_ONLY) {
      expect(labels).not.toContain(hidden);
    }
  });

  it('admin vê as 15 telas (inclui Pedidos do titular, #293, e Minha conta, #295)', async () => {
    const labels = await renderNav('company_admin');

    expect(labels).toHaveLength(15);
    expect(labels).toContain('Pedidos do titular');
  });

  it('C41 página proibida mostra sem permissão', async () => {
    mockIdentity('atendente');
    pathname.current = '/faturamento/qualquer';
    const pageFetch = vi.fn();
    function FakeBillingPage() {
      pageFetch();
      return <p>conteúdo do faturamento</p>;
    }

    render(
      <WithStaffIdentity>
        <RoleGate>
          <FakeBillingPage />
        </RoleGate>
      </WithStaffIdentity>,
    );

    expect(
      await screen.findByText('Seu papel não tem acesso a esta tela.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByText('conteúdo do faturamento'),
    ).not.toBeInTheDocument();
    expect(pageFetch).not.toHaveBeenCalled();
    expect(
      screen.getByRole('link', { name: 'Voltar ao início' }),
    ).toHaveAttribute('href', '/');
  });

  it('página permitida renderiza direto, sem esperar a identidade', () => {
    mockIdentity('atendente');
    pathname.current = '/agenda';

    render(
      <WithStaffIdentity>
        <RoleGate>
          <p>agenda</p>
        </RoleGate>
      </WithStaffIdentity>,
    );

    expect(screen.getByText('agenda')).toBeInTheDocument();
  });

  it('página restrita espera a identidade antes de decidir', async () => {
    mockIdentity('company_admin');
    pathname.current = '/faturamento';

    render(
      <WithStaffIdentity>
        <RoleGate>
          <p>faturamento</p>
        </RoleGate>
      </WithStaffIdentity>,
    );

    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(await screen.findByText('faturamento')).toBeInTheDocument();
  });

  it('caminho fora do mapa de telas não é bloqueado', () => {
    mockIdentity('atendente');
    pathname.current = '/pacientes/abc';

    render(
      <WithStaffIdentity>
        <RoleGate>
          <p>ficha</p>
        </RoleGate>
      </WithStaffIdentity>,
    );

    expect(screen.getByText('ficha')).toBeInTheDocument();
  });
});
