// @vitest-environment jsdom

import { cleanup, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import ContasPage from '@/app/(staff)/configuracoes/contas/page';
import DadosPage from '@/app/(staff)/configuracoes/dados/page';
import EmailPage from '@/app/(staff)/configuracoes/email/page';
import FeriadosPage from '@/app/(staff)/configuracoes/feriados/page';
import GoogleAgendaPage from '@/app/(staff)/configuracoes/google-agenda/page';
import HorariosPage from '@/app/(staff)/configuracoes/horarios/page';
import IdentidadePage from '@/app/(staff)/configuracoes/identidade/page';
import PrivacidadePage from '@/app/(staff)/configuracoes/privacidade/page';
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

const DENIED = 'Seu papel não tem acesso a esta seção.';

/** Cada sub-rota real, o título da seção e quem a enxerga (ACE-RN-43). */
const SUBROTAS: Array<{
  slug: string;
  page: () => ReactElement;
  heading: string;
  roles: UserRole[];
}> = [
  {
    slug: 'dados',
    page: DadosPage,
    heading: 'Dados da clínica',
    roles: ['company_admin'],
  },
  {
    slug: 'identidade',
    page: IdentidadePage,
    heading: 'Identidade visual',
    roles: ['company_admin', 'atendente', 'profissional'],
  },
  {
    slug: 'privacidade',
    page: PrivacidadePage,
    heading: 'Privacidade (LGPD)',
    roles: ['company_admin'],
  },
  {
    slug: 'horarios',
    page: HorariosPage,
    heading: 'Grade de horários',
    roles: ['company_admin'],
  },
  {
    slug: 'feriados',
    page: FeriadosPage,
    heading: 'Feriados e ausências',
    roles: ['company_admin', 'atendente', 'profissional'],
  },
  {
    slug: 'google-agenda',
    page: GoogleAgendaPage,
    heading: 'Google Agenda',
    roles: ['company_admin'],
  },
  {
    slug: 'email',
    page: EmailPage,
    heading: 'Canal de e-mail',
    roles: ['company_admin'],
  },
  {
    slug: 'contas',
    page: ContasPage,
    heading: 'Contas de acesso da equipe',
    roles: ['company_admin'],
  },
];

const PAPEIS: UserRole[] = ['company_admin', 'atendente', 'profissional'];

describe('Feature: sub-rotas reais de Configurações por papel (#522)', () => {
  for (const { slug, page: Page, heading, roles } of SUBROTAS) {
    for (const role of PAPEIS) {
      const permitido = roles.includes(role);
      it(`Dado ${role}, Quando abrir /configuracoes/${slug}, Então ${permitido ? 'vê a seção' : 'vê «sem acesso»'}`, async () => {
        mockFetch(role);
        renderWithToast(
          <WithStaffIdentity>
            <Page />
          </WithStaffIdentity>,
        );

        if (permitido) {
          expect(
            await screen.findByRole('heading', { name: heading }),
          ).toBeInTheDocument();
          expect(screen.queryByText(DENIED)).not.toBeInTheDocument();
        } else {
          expect(await screen.findByText(DENIED)).toBeInTheDocument();
          expect(
            screen.queryByRole('heading', { name: heading }),
          ).not.toBeInTheDocument();
        }
        expect(
          screen.getByRole('link', { name: 'Voltar ao índice' }),
        ).toHaveAttribute('href', '/configuracoes');
      });
    }
  }

  it('Dado o Admin, Quando abrir Identidade, Então vê o logo da clínica além da identidade visual', async () => {
    mockFetch('company_admin');
    renderWithToast(
      <WithStaffIdentity>
        <IdentidadePage />
      </WithStaffIdentity>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Logo da clínica' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Identidade visual' }),
    ).toBeInTheDocument();
  });

  it('Dado o Atendente, Quando abrir Identidade, Então vê só a identidade visual, sem o logo', async () => {
    mockFetch('atendente');
    renderWithToast(
      <WithStaffIdentity>
        <IdentidadePage />
      </WithStaffIdentity>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Identidade visual' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Logo da clínica' }),
    ).not.toBeInTheDocument();
  });
});
