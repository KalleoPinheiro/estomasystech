// @vitest-environment jsdom

import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { SidebarIdentity } from '@/app/(staff)/staff-layout-client';
import type { SidebarIdentityDto } from '@/lib/dto';

function jsonResponse(
  success: boolean,
  data: unknown,
  error: string | null = null,
) {
  return {
    ok: success,
    json: async () => ({ success, data, error }),
  };
}

function mockIdentityFetch(identity: SidebarIdentityDto) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/auth/identity')) {
        return jsonResponse(true, identity);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: Identidade de sessão na sidebar (issue #126)', () => {
  it('Dado clinicId válido, Quando carrega, Então mostra o nome real da clínica, o e-mail e o papel', async () => {
    mockIdentityFetch({
      clinicLabel: 'Clínica VittaFlow Ltda',
      account: {
        email: 'ana@clinica.com',
        role: 'company_admin',
        roleLabel: 'Admin de Empresa',
        professionalId: null,
      },
    });

    renderWithToast(<SidebarIdentity />);

    await waitFor(() => {
      expect(screen.getByText('Clínica VittaFlow Ltda')).toBeInTheDocument();
    });
    // E-mail e papel em linhas separadas: o e-mail aparece inteiro (#199) e
    // o papel continua sempre visível.
    expect(screen.getByText('ana@clinica.com')).toHaveAttribute(
      'title',
      'ana@clinica.com',
    );
    expect(screen.getByText('Admin de Empresa')).toBeInTheDocument();
  });

  it('Dado super_admin (clinicId null), Quando carrega, Então mostra "Conta de sistema" no lugar do nome da clínica', async () => {
    mockIdentityFetch({
      clinicLabel: 'Conta de sistema',
      account: {
        email: 'root@vitta.com',
        role: 'company_admin',
        roleLabel: 'Super Admin',
        professionalId: null,
      },
    });

    renderWithToast(<SidebarIdentity />);

    await waitFor(() => {
      expect(screen.getByText('Conta de sistema')).toBeInTheDocument();
    });
  });

  it('Não sobra nenhum texto fixo de "Clínica de Estomaterapia" no componente', async () => {
    mockIdentityFetch({
      clinicLabel: 'Clínica B (teste)',
      account: {
        email: 'x@y.com',
        role: 'company_admin',
        roleLabel: 'Atendente',
        professionalId: null,
      },
    });

    renderWithToast(<SidebarIdentity />);

    await waitFor(() => {
      expect(screen.getByText('Clínica B (teste)')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Clínica de Estomaterapia'),
    ).not.toBeInTheDocument();
  });

  it('C42 e-mail da sidebar quebra linha em vez de truncar', async () => {
    mockIdentityFetch({
      clinicLabel: 'Clínica VittaFlow Ltda',
      account: {
        email: 'recepcao.turno.manha@clinica-estomaterapia.com.br',
        role: 'atendente',
        roleLabel: 'Atendente',
        professionalId: null,
      },
    });

    renderWithToast(<SidebarIdentity />);

    const email = await screen.findByText(
      'recepcao.turno.manha@clinica-estomaterapia.com.br',
    );
    expect(email).not.toHaveClass('truncate');
    expect(email).toHaveClass('break-all');
  });
});
