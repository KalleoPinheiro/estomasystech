// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { AppointmentDetail } from '@/app/(staff)/agenda/appointment-detail';
import { CalendarGrid } from '@/app/(staff)/agenda/calendar-grid';
import DashboardPage from '@/app/(staff)/page';
import type { AppointmentDto } from '@/lib/dto';
import { mockHojeData, resetHojeData } from '../support/hoje-data';
import { renderServerPage } from '../support/server-page';

vi.mock('next/navigation', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    useRouter: () => ({ refresh: hoje.refresh, push: vi.fn() }),
    usePathname: () => '/',
  };
});
vi.mock('@/lib/server/session', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { requireStaffPage: hoje.requireStaffPage };
});
vi.mock('@/lib/server/data/appointments', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listAppointmentsFor: hoje.listAppointmentsFor };
});
vi.mock('@/lib/server/data/month-summary', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { buildMonthSummary: hoje.buildMonthSummary };
});
vi.mock('@/lib/server/data/follow-ups', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listFollowUpsFor: hoje.listFollowUpsFor };
});
vi.mock('@/lib/server/data/reminders', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { whatsappSentToday: hoje.whatsappSentToday };
});
vi.mock('@/lib/server/data/supplies', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listSuppliesFor: hoje.listSuppliesFor };
});
vi.mock('@/lib/server/data/triage', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { buildLinkedTriageQueue: hoje.buildLinkedTriageQueue };
});
vi.mock('@/lib/server/data/majority', async () => {
  const { hoje } = await import('../support/hoje-data');
  return { listMajorityReviewsFor: hoje.listMajorityReviewsFor };
});
vi.mock('@/app/(staff)/hoje-actions', async () => {
  const { hoje } = await import('../support/hoje-data');
  return {
    resolveFollowUp: hoje.resolveFollowUp,
    decideTriage: hoje.decideTriage,
    keepMajorityGuardian: hoje.keepMajorityGuardian,
  };
});

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

beforeEach(() => {
  resetHojeData();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Feature: consulta passada sem desfecho (#480)', () => {
  it('Dado uma consulta de dias atrás ainda agendada, Quando a tela Hoje abre, Então lista a pendência com atalho para a agenda', async () => {
    mockHojeData({ role: 'atendente', recent: [passada] });

    await renderServerPage(DashboardPage);

    expect(
      await screen.findByText('Consultas sem desfecho (1)'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir a agenda para dar o desfecho' }),
    ).toHaveAttribute('href', '/agenda');
  });

  it('Dado só consulta futura, Quando a tela Hoje abre, Então não mostra pendência', async () => {
    mockHojeData({ role: 'atendente', today: [futura], recent: [futura] });

    await renderServerPage(DashboardPage);

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
