// @vitest-environment jsdom

import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '@/app/(staff)/configuracoes/page';
import type { UserRole } from '@/domain/auth/user-role';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

function mockFetch(role: UserRole) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/auth/identity')) return ok(identityFor(role));
      if (url.startsWith('/api/settings/schedule/closures')) return ok([]);
      if (url.startsWith('/api/settings/schedule'))
        return ok({
          config: {
            weekdays: [1],
            startHour: 8,
            endHour: 18,
            minGapMinutes: 30,
          },
          isDefault: false,
        });
      if (url.startsWith('/api/settings/clinic-info'))
        return ok({ info: { name: 'Clínica' } });
      if (url.startsWith('/api/settings/calendar-integration'))
        return ok({ connected: false, email: null, connectedAt: null });
      return ok(null);
    }),
  );
}

const atalhos = async () => {
  const nav = await screen.findByRole('navigation', {
    name: 'Seções da configuração',
  });
  return within(nav)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')]);
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: atalhos das seções em Configurações', () => {
  it('Dado Admin, Quando abrir, Então vê um atalho para cada seção administrativa', async () => {
    mockFetch('company_admin');
    renderWithToast(
      <WithStaffIdentity>
        <SettingsPage />
      </WithStaffIdentity>,
    );

    expect(await atalhos()).toEqual(
      expect.arrayContaining([
        ['Dados cadastrais', '/configuracoes/dados'],
        ['Identidade', '/configuracoes/identidade'],
        ['Horários e agenda', '/configuracoes/horarios'],
        ['Feriados e ausências', '/configuracoes/feriados'],
        ['Canal de e-mail', '/configuracoes/email'],
        ['Contas de acesso', '/configuracoes/contas'],
      ]),
    );
  });

  it('Dado Atendente, Quando abrir, Então os atalhos cobrem só as seções que ele pode usar', async () => {
    mockFetch('atendente');
    renderWithToast(
      <WithStaffIdentity>
        <SettingsPage />
      </WithStaffIdentity>,
    );

    const links = await atalhos();
    expect(links.map(([label]) => label)).toEqual([
      'Identidade',
      'Feriados e ausências',
    ]);
  });
});
