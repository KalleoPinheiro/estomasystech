// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { ClinicInfoSection } from '@/app/(staff)/configuracoes/clinic-info-section';
import { SectionPrefetch } from '@/app/(staff)/configuracoes/section-prefetch';
import { SettingsIndex } from '@/app/(staff)/configuracoes/settings-index';
import { PrefetchedQueries } from '@/lib/prefetched-queries';
import { resolveServerTree } from '../support/server-page';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

const mocks = vi.hoisted(() => ({
  requireStaffPageFor: vi.fn(),
  prefetchSettings: vi.fn(),
}));

vi.mock('@/lib/server/session', () => ({
  requireStaffPageFor: mocks.requireStaffPageFor,
}));
vi.mock('@/lib/server/data/settings-prefetch', () => ({
  prefetchSettings: mocks.prefetchSettings,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Feature: Configurações chega com os dados no HTML (#557)', () => {
  it('Dado a seção Dados da clínica pré-lida, Quando monta, Então mostra o cadastro sem chamar /api', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderWithToast(
      <PrefetchedQueries
        entries={{
          '/api/settings/clinic-info': {
            info: { name: 'Clínica Lida No Servidor', cnpj: null },
          },
        }}
      >
        <ClinicInfoSection />
      </PrefetchedQueries>,
    );

    expect(screen.getByText('Dados da clínica')).toBeTruthy();
    expect(screen.getByDisplayValue('Clínica Lida No Servidor')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Dado a sessão do Admin, Quando o servidor monta a seção, Então a guarda roda e as respostas vão ao cliente', async () => {
    const session = { role: 'company_admin' };
    mocks.requireStaffPageFor.mockResolvedValue(session);
    mocks.prefetchSettings.mockResolvedValue({
      '/api/settings/clinic-info': { info: { name: 'Clínica do Servidor' } },
    });
    vi.stubGlobal('fetch', vi.fn());

    const tree = await resolveServerTree(
      <SectionPrefetch slug="dados">
        <ClinicInfoSection />
      </SectionPrefetch>,
    );
    renderWithToast(tree as React.ReactElement);

    expect(mocks.requireStaffPageFor).toHaveBeenCalledWith('/configuracoes');
    expect(mocks.prefetchSettings).toHaveBeenCalledWith(session, 'dados');
    expect(screen.getByDisplayValue('Clínica do Servidor')).toBeTruthy();
  });

  it('Dado o índice, Quando monta, Então lista as seções do papel; só a identidade do casco é lida', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        success: true,
        data: identityFor('company_admin'),
        error: null,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <WithStaffIdentity>
        <SettingsIndex />
      </WithStaffIdentity>,
    );

    expect(await screen.findByText('Dados cadastrais')).toBeTruthy();
    expect(
      fetchMock.mock.calls.every(([url]) => url === '/api/auth/identity'),
    ).toBe(true);
  });
});
