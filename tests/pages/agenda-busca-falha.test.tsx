// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentDto } from '@/lib/dto';
import {
  agenda,
  click,
  renderAgenda,
  resetAgenda,
} from '../support/agenda-app';

vi.mock('next/navigation', async () => {
  const { agenda } = await import('../support/agenda-app');
  return {
    useRouter: () => agenda.router,
    useParams: () => ({}),
    usePathname: () => '/agenda',
  };
});
vi.mock('@/app/(staff)/agenda/agenda-actions', async () => {
  const { legacyActions } = await import('../support/agenda-app');
  return legacyActions;
});
vi.mock('@/lib/server/session', async () => {
  const { agenda } = await import('../support/agenda-app');
  return { requireStaffPage: agenda.requireStaffPage };
});
vi.mock('@/lib/server/data/appointments', async () => {
  const { agenda } = await import('../support/agenda-app');
  return {
    listAppointmentsFor: agenda.listAppointmentsFor,
    countAppointmentsFor: agenda.countAppointmentsFor,
  };
});
vi.mock('@/lib/server/data/professionals', async () => {
  const { agenda } = await import('../support/agenda-app');
  return { listProfessionalOptions: agenda.listProfessionalOptions };
});
vi.mock('@/lib/server/data/schedule', async () => {
  const { agenda } = await import('../support/agenda-app');
  return {
    loadScheduleConfig: agenda.loadScheduleConfig,
    listClosuresFor: agenda.listClosuresFor,
  };
});
vi.mock('@/lib/server/data/waitlist', async () => {
  const { agenda } = await import('../support/agenda-app');
  return { listWaitlistFor: agenda.listWaitlistFor };
});

const COUNTS = {
  scheduled: 1,
  confirmed: 0,
  completed: 0,
  cancelled: 1,
  no_show: 0,
};

const dto = (
  id: string,
  status: string,
  patientName: string,
): AppointmentDto => ({
  id,
  patientId: 'p',
  patientName,
  startsAt: new Date(2026, 9, 22, 9).toISOString(),
  endsAt: new Date(2026, 9, 22, 10).toISOString(),
  procedure: 'Curativo',
  priceCents: 9000,
  notes: null,
  status,
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});

/** Lista e contagem podem falhar (429) até a falha ser desligada. */
const RATE_LIMITED = 'Muitas requisições';

function seedAgenda() {
  resetAgenda({
    counts: COUNTS,
    appointments: ({ statuses }) =>
      statuses?.includes('cancelled')
        ? [dto('c', 'cancelled', 'Paciente Cancelada')]
        : [dto('s', 'scheduled', 'Paciente Agendada')],
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Feature: busca da agenda que falha (#578)', () => {
  it('Dada a busca em 429 após marcar «Cancelada», Quando falha, Então alerta e botão no lugar da grade, sem a consulta do recorte anterior', async () => {
    seedAgenda();
    await renderAgenda();
    await screen.findByText(/Paciente Agendada/);

    agenda.state.fail.appointments = RATE_LIMITED;
    await click(screen.getByRole('button', { name: /^Cancelada, 1 consulta/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Não foi possível carregar as consultas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
    // A grade nunca mostra o dado do recorte anterior.
    expect(screen.queryByText(/Paciente Agendada/)).toBeNull();
    expect(screen.queryByText(/Paciente Cancelada/)).toBeNull();
  });

  it('Dado o alerta de erro, Quando clicar em «Tentar de novo» e a busca der certo, Então a grade mostra o recorte dos chips', async () => {
    seedAgenda();
    await renderAgenda();
    await screen.findByText(/Paciente Agendada/);
    agenda.state.fail.appointments = RATE_LIMITED;
    await click(screen.getByRole('button', { name: /^Cancelada, 1 consulta/ }));
    await screen.findByRole('alert');

    agenda.state.fail.appointments = undefined;
    await click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByText(/Paciente Cancelada/)).toBeTruthy();
    // Chips e grade concordam: Cancelada marcada e a Agendada, do padrão, continua marcada.
    expect(
      screen.getByRole('button', { name: /^Cancelada, 1 consulta/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Agendada, 1 consulta' }),
    ).toBeTruthy();
  });

  it('Dada só a contagem em 429, Quando abrir, Então a grade aparece, os chips mostram «—» e o alerta oferece nova tentativa', async () => {
    seedAgenda();
    agenda.state.fail.counts = RATE_LIMITED;
    await renderAgenda();

    expect(await screen.findByText(/Paciente Agendada/)).toBeTruthy();
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Agendada, indisponível' })
        .textContent,
    ).toContain('—');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });

  it('Dada a grade carregada, Quando refazer a mesma URL falha, Então a grade some e o alerta fica no lugar dela', async () => {
    seedAgenda();
    agenda.state.fail.counts = RATE_LIMITED;
    await renderAgenda();
    // Só a contagem falha: a grade da URL corrente segue visível com o alerta.
    expect(await screen.findByText(/Paciente Agendada/)).toBeTruthy();
    await screen.findByRole('alert');

    agenda.state.fail.appointments = RATE_LIMITED;
    await click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() =>
      expect(screen.queryByText(/Paciente Agendada/)).toBeNull(),
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Não foi possível carregar as consultas.',
    );
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});
