// @vitest-environment jsdom

import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '@/app/(staff)/configuracoes/page';
import { SettingsSectionPage } from '@/app/(staff)/configuracoes/section-page';
import { SETTINGS_SECTIONS } from '@/app/(staff)/configuracoes/sections';
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

describe('Feature: índice de Configurações em sub-rotas (#522)', () => {
  it('Dado o Admin, Quando abrir, Então o índice tem âncora própria e cada seção é uma sub-rota com «Voltar ao índice» para ele', async () => {
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
    expect(SETTINGS_SECTIONS.map((section) => section.slug)).toEqual(sections);
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(sections.map((slug) => `/configuracoes/${slug}`));

    for (const slug of SETTINGS_SECTIONS.map((section) => section.slug)) {
      cleanup();
      renderWithToast(
        <WithStaffIdentity>
          <SettingsSectionPage slug={slug}>
            <p>conteúdo</p>
          </SettingsSectionPage>
        </WithStaffIdentity>,
      );
      const link = await screen.findByRole('link', {
        name: 'Voltar ao índice',
      });
      expect(link).toHaveAttribute('href', '/configuracoes');
    }
  });

  it('Dado o Atendente, Quando abrir, Então o índice lista só as seções dele', async () => {
    mockFetch('atendente');
    renderWithToast(
      <WithStaffIdentity>
        <SettingsPage />
      </WithStaffIdentity>,
    );

    const nav = await screen.findByRole('navigation', {
      name: 'Seções da configuração',
    });
    expect(await within(nav).findAllByRole('link')).toHaveLength(2);
  });

  it('Dado o Atendente, Quando abrir a sub-rota de contas, Então vê «sem acesso» e não o conteúdo', async () => {
    mockFetch('atendente');
    renderWithToast(
      <WithStaffIdentity>
        <SettingsSectionPage slug="contas">
          <p>conteúdo</p>
        </SettingsSectionPage>
      </WithStaffIdentity>,
    );

    expect(
      await screen.findByText('Seu papel não tem acesso a esta seção.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });
});
