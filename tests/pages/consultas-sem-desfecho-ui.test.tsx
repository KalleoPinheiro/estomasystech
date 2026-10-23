// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import { CalendarGrid } from '@/app/(staff)/agenda/calendar-grid';
import DashboardPage from '@/app/(staff)/page';
import type { AppointmentDto } from '@/lib/dto';
import { identityFor, WithStaffIdentity } from '../support/staff-identity';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

const ok = (data: unknown) => ({
  ok: true,
  json: async () => ({ success: true, data, error: null }),
});

const passada: AppointmentDto = {
  id: 'appt-passada',
  patientId: 'pat-1',
  patientName: 'Maria Souza',
  startsAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  endsAt: new Date(Date.now() - 3 * 86_400_000 + 3_600_000).toISOString(),
  procedure: 'Troca de bolsa',
  priceCents: 12000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
};

const futura: AppointmentDto = {
  ...passada,
  id: 'appt-futura',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 86_400_000 + 3_600_000).toISOString(),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: consulta passada sem desfecho (#480)', () => {
  it('Dado uma consulta de dias atrás ainda agendada, Quando a tela Hoje abre, Então lista a pendência com atalho para a agenda', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/auth/identity')) {
          return ok(identityFor('atendente'));
        }
        if (url.startsWith('/api/appointments')) return ok([passada]);
        if (url.startsWith('/api/follow-ups')) return ok([]);
        if (url.startsWith('/api/reminders/whatsapp-link')) return ok({});
        if (url.startsWith('/api/guardians/majority')) return ok([]);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderWithToast(
      <WithStaffIdentity>
        <DashboardPage />
      </WithStaffIdentity>,
    );

    expect(
      await screen.findByText('Consultas sem desfecho (1)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir a agenda para dar o desfecho' }),
    ).toHaveAttribute('href', '/agenda');
  });

  it('Dado só consulta futura, Quando a tela Hoje abre, Então não mostra pendência', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/auth/identity')) {
          return ok(identityFor('atendente'));
        }
        if (url.startsWith('/api/appointments')) return ok([futura]);
        if (url.startsWith('/api/follow-ups')) return ok([]);
        if (url.startsWith('/api/reminders/whatsapp-link')) return ok({});
        if (url.startsWith('/api/guardians/majority')) return ok([]);
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    renderWithToast(
      <WithStaffIdentity>
        <DashboardPage />
      </WithStaffIdentity>,
    );

    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(
      screen.queryByText(/Consultas sem desfecho/),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['passada', passada, true],
    ['futura', futura, false],
  ])(
    'Dado a consulta %s aberta no diálogo, Então o aviso de desfecho aparece: %s',
    (_nome, consulta, aviso) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ok({})),
      );
      renderWithToast(
        <AppointmentDetail
          appointment={consulta}
          onAction={vi.fn()}
          onReschedule={vi.fn()}
        />,
      );
      const mensagem = screen.queryByText(/já passou e segue sem desfecho/);
      expect(mensagem !== null).toBe(aviso);
    },
  );

  it('Dado a grade do mês com uma consulta passada sem desfecho, Então o bloco ganha o realce e a legenda o explica', () => {
    render(
      <CalendarGrid
        monthDate={new Date(passada.startsAt)}
        appointments={[passada]}
        onDayClick={vi.fn()}
        onAppointmentClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sem desfecho \(já passou\)/)).toBeInTheDocument();
    expect(screen.getByTitle(/Troca de bolsa \(Sem desfecho\)/)).toHaveClass(
      'ring-warning',
    );
  });
});
