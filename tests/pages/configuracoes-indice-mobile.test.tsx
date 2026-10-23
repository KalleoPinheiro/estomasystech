// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: índice fixo de Configurações no celular (#522)', () => {
  it('Dado o Admin, Quando abrir, Então o índice tem âncora própria e cada seção oferece «Voltar ao índice»', async () => {
    mockFetch('company_admin');
    renderWithToast(
      <WithStaffIdentity>
        <SettingsPage />
      </WithStaffIdentity>,
    );

    const nav = await screen.findByRole('navigation', {
      name: 'Seções da configuração',
    });
    expect(nav).toHaveAttribute('id', 'indice-secoes');
    const sections = [
      'dados',
      'identidade',
      'privacidade',
      'horarios',
      'feriados',
      'google-agenda',
      'email',
      'contas',
    ];
    const links = await screen.findAllByRole('link', {
      name: 'Voltar ao índice',
    });
    expect(links).toHaveLength(sections.length);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '#indice-secoes');
    }
  });

  it('Dado o Atendente, Quando abrir, Então só as seções dele têm «Voltar ao índice»', async () => {
    mockFetch('atendente');
    renderWithToast(
      <WithStaffIdentity>
        <SettingsPage />
      </WithStaffIdentity>,
    );

    await screen.findByRole('navigation', { name: 'Seções da configuração' });
    expect(
      await screen.findAllByRole('link', { name: 'Voltar ao índice' }),
    ).toHaveLength(2);
  });
});
