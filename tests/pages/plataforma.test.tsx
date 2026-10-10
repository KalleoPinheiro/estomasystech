// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
    // A única navegação é a da plataforma (C4) — nada da sidebar da equipe.
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.queryByText('Pacientes')).not.toBeInTheDocument();
    expect(screen.queryByText('Agenda')).not.toBeInTheDocument();
  });

  it('Dado o super_admin em /plataforma, Quando renderizar, Então fica sem o link da trilha na lista (a navegação leva à Auditoria)', () => {
    render(<PlatformPage />);

    expect(
      screen.queryByRole('link', { name: 'Trilha da plataforma' }),
    ).not.toBeInTheDocument();
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

const envelope = (data: unknown, ok = true, error: string | null = null) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => ({ success: ok, data, error }),
});

const summary = (overrides: Record<string, unknown>) => ({
  id: 'c1',
  name: 'Clínica',
  cnpj: '12.345.678/0001-95',
  registrationComplete: true,
  status: 'active',
  adminStatus: 'active',
  emailChannel: {
    configured: false,
    provider: null,
    lastStatus: null,
    lastStatusAt: null,
  },
  createdAt: '2026-09-27T00:00:00.000Z',
  ...overrides,
});

describe('Feature: Lista de clínicas da plataforma (B4)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dadas clínicas, Quando abrir /plataforma, Então lista as clínicas com cadastro, estado do admin e link para o detalhe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope([
          summary({ id: 'a', name: 'Alfa', adminStatus: 'active' }),
          summary({
            id: 'b',
            name: 'Beta',
            adminStatus: 'pending',
          }),
          summary({
            id: 'legacy-clinic',
            name: 'Clínica legada',
            cnpj: null,
            registrationComplete: false,
            adminStatus: 'none',
          }),
        ]),
      ),
    );

    render(<PlatformPage />);

    const alfa = await screen.findByRole('link', { name: 'Alfa' });
    expect(alfa).toHaveAttribute('href', '/plataforma/clinicas/a');
    for (const header of ['Nome', 'CNPJ', 'Cadastro', 'Admin']) {
      expect(
        screen.getByRole('columnheader', { name: header }),
      ).toBeInTheDocument();
    }
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Ativo')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Cadastro completo')).toBeInTheDocument();
    expect(
      within(rows[2]).getByText('Aguardando primeiro acesso'),
    ).toBeInTheDocument();
    expect(within(rows[3]).getByText('Sem admin')).toBeInTheDocument();
    expect(
      within(rows[3]).getByText('Cadastro incompleto'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nova clínica' })).toHaveAttribute(
      'href',
      '/plataforma/clinicas/nova',
    );
  });

  it('Dada lista vazia, Quando abrir /plataforma, Então mostra sem clínicas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope([])));

    render(<PlatformPage />);

    expect(
      await screen.findByText('Nenhuma clínica cadastrada.'),
    ).toBeInTheDocument();
  });

  it('Dada falha da API, Quando abrir /plataforma, Então mostra o erro ao listar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(envelope(null, false, 'Banco fora do ar')),
    );

    render(<PlatformPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Banco fora do ar',
    );
  });
});

describe('Feature: Situação das clínicas na lista (B5)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dadas uma clínica ativa e uma suspensa, Quando listar, Então a coluna situação da clínica mostra Ativa e Suspensa', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          envelope([
            summary({ id: 'a', name: 'Clínica Ativa' }),
            summary({ id: 's', name: 'Clínica Suspensa', status: 'suspended' }),
          ]),
        ),
    );
    render(<PlatformPage />);

    const activeRow = (await screen.findByText('Clínica Ativa')).closest(
      'tr',
    ) as HTMLElement;
    const suspendedRow = screen
      .getByText('Clínica Suspensa')
      .closest('tr') as HTMLElement;
    expect(
      screen.getByRole('columnheader', { name: 'Situação' }),
    ).toBeInTheDocument();
    expect(within(activeRow).getByText('Ativa')).toBeInTheDocument();
    expect(within(suspendedRow).getByText('Suspensa')).toBeInTheDocument();
  });
});

const channel = (lastStatus: 'ok' | 'failed' | null) => ({
  configured: true,
  provider: 'resend',
  lastStatus,
  lastStatusAt: lastStatus ? '2026-10-09T14:30:00.000Z' : null,
});

describe('Feature: status do canal de e-mail na lista (C4, #267)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Dadas clínicas em cada estado do canal, Quando listar, Então cada linha mostra o status do canal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        envelope([
          summary({ id: 'a', name: 'A Ok', emailChannel: channel('ok') }),
          summary({
            id: 'b',
            name: 'B Falha',
            emailChannel: channel('failed'),
          }),
          summary({ id: 'c', name: 'C Novo', emailChannel: channel(null) }),
          summary({ id: 'd', name: 'D Sem' }),
        ]),
      ),
    );
    render(<PlatformPage />);
    await screen.findByText('A Ok');

    expect(
      screen.getByRole('columnheader', { name: 'E-mail' }),
    ).toBeInTheDocument();
    const expected: [string, string][] = [
      ['A Ok', 'E-mail: configurado'],
      ['B Falha', 'E-mail: falhando'],
      ['C Novo', 'E-mail: não testado'],
      ['D Sem', 'E-mail: sem canal'],
    ];
    for (const [name, label] of expected) {
      const row = screen.getByText(name).closest('tr') as HTMLElement;
      expect(within(row).getByText(label)).toBeInTheDocument();
    }
  });
});
