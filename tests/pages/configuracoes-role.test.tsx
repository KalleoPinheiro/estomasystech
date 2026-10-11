// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import SettingsPage from '@/app/(staff)/configuracoes/page';
import type { UserRole } from '@/domain/auth/user-role';
import type { ScheduleClosureDto } from '@/lib/dto';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const ANA = { id: 'prof-ana', fullName: 'Dra. Ana', active: true };
const BIA = { id: 'prof-bia', fullName: 'Dra. Bia', active: true };
const natal: ScheduleClosureDto = {
  id: 'c-natal',
  professionalId: null,
  startsOn: '2099-12-25',
  endsOn: '2099-12-25',
  reason: 'Natal',
};
const feriasAna: ScheduleClosureDto = {
  id: 'c-ana',
  professionalId: ANA.id,
  startsOn: '2099-07-01',
  endsOn: '2099-07-15',
  reason: 'Férias da Ana',
};
const congressoBia: ScheduleClosureDto = {
  id: 'c-bia',
  professionalId: BIA.id,
  startsOn: '2099-08-01',
  endsOn: '2099-08-03',
  reason: 'Congresso da Bia',
};

/** Responde à identidade do papel e às rotas que a tela carrega; grava as URLs. */
function mockFetch(role: UserRole, professionalId: string | null = null) {
  const calls: { url: string; method: string; body: string | null }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: (init?.body as string) ?? null });
      if (url.startsWith('/api/auth/identity')) {
        return ok(identityFor(role, professionalId));
      }
      if (
        url.startsWith('/api/settings/schedule/closures') &&
        method === 'POST'
      )
        return ok({ closure: feriasAna, affectedAppointments: [] });
      if (url.startsWith('/api/settings/schedule/closures'))
        return ok([natal, feriasAna, congressoBia]);
      if (url.startsWith('/api/options/professionals')) return ok([ANA, BIA]);
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
      if (url.startsWith('/api/settings/email-channel')) return ok(null);
      if (url.startsWith('/api/accounts')) return ok([]);
      if (url.startsWith('/api/professionals')) return ok([]);
      return ok(null);
    }),
  );
  return calls;
}

const renderPage = async () => {
  renderWithToast(
    <WithStaffIdentity>
      <SettingsPage />
    </WithStaffIdentity>,
  );
  await screen.findByText('Natal');
};

const headings = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

const removeButtonIn = (text: string) =>
  within(screen.getByText(text).closest('tr') as HTMLElement).queryByRole(
    'button',
    { name: 'Remover' },
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** #215: a tela Configurações mostra a cada papel só o que ele pode usar. */
describe('Feature: Configurações por papel (#215)', () => {
  it('Dado Admin, Quando abrir, Então vê grade, feriados e as seções administrativas', async () => {
    mockFetch('company_admin');
    await renderPage();

    await screen.findByText('Grade de horários');
    expect(headings()).toEqual(
      expect.arrayContaining([
        'Dados da clínica',
        'Grade de horários',
        'Feriados e ausências',
        'Google Agenda',
      ]),
    );
    await screen.findByText('Contas de acesso da equipe');
  });

  it('Dado Atendente, Quando abrir, Então só Feriados e ausências, com qualquer profissional e remoção de todos', async () => {
    const calls = mockFetch('atendente');
    await renderPage();

    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Quem')).getAllByRole('option'),
      ).toHaveLength(3),
    );
    expect(headings()).toEqual(['Feriados e ausências']);
    expect(removeButtonIn('Natal')).not.toBeNull();
    expect(removeButtonIn('Congresso da Bia')).not.toBeNull();
    // Nenhuma chamada a rota administrativa (403 na API).
    const urls = calls.map((c) => c.url);
    expect(urls.some((u) => u === '/api/settings/schedule')).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/settings/clinic-info'))).toBe(
      false,
    );
    expect(urls.some((u) => u.startsWith('/api/professionals'))).toBe(false);
  });

  it('Dado Profissional, Quando abrir, Então registra só a própria ausência e remove só a dela', async () => {
    const calls = mockFetch('profissional', ANA.id);
    await renderPage();

    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Quem'))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Dra. Ana']),
    );
    expect(headings()).toEqual(['Feriados e ausências']);
    expect(removeButtonIn('Férias da Ana')).not.toBeNull();
    expect(removeButtonIn('Natal')).toBeNull();
    expect(removeButtonIn('Congresso da Bia')).toBeNull();

    fireEvent.change(screen.getByLabelText(/De/), {
      target: { value: '2099-07-01' },
    });
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: 'Férias' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar bloqueio' }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST')).toBe(true),
    );
    const post = calls.find((c) => c.method === 'POST');
    expect(JSON.parse(post?.body ?? '{}')).toMatchObject({
      professionalId: ANA.id,
    });
  });
});
