// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarGrid } from '@/app/(staff)/agenda/calendar-grid';
import { layoutDay, visibleHours } from '@/app/(staff)/agenda/week-layout';
import { WeekView } from '@/app/(staff)/agenda/week-view';
import type { AppointmentDto } from '@/lib/dto';
import {
  agenda,
  click,
  renderAgenda,
  resetAgenda,
  visit,
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
  scheduled: 3,
  confirmed: 1,
  completed: 0,
  cancelled: 4,
  no_show: 2,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
  resetAgenda({ counts: COUNTS });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Status que a página pediu ao servidor na última leitura da lista. */
const lastStatuses = () =>
  agenda.listAppointmentsFor.mock.calls.at(-1)?.[1].statuses;

const dto = (status: string): AppointmentDto => ({
  id: status,
  patientId: 'p',
  patientName: 'Paciente Teste',
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

describe('Feature: Filtro de status na página da agenda (#538)', () => {
  it('AGE-FLT-02/03: Dada a agenda sem parâmetro, Quando abrir, Então pede ao servidor o padrão sem canceladas', async () => {
    await renderAgenda();

    await screen.findByRole('button', { name: 'Agendada, 3 consultas' });
    expect(lastStatuses()).toEqual([
      'scheduled',
      'confirmed',
      'completed',
      'no_show',
    ]);
    expect(
      screen.getByRole('button', { name: 'Cancelada, 4 consultas' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('AGE-FLT-04: Dado ?status=completed, Quando abrir, Então só Concluída marcada e enviada ao servidor', async () => {
    await renderAgenda('/agenda?status=completed');

    expect(lastStatuses()).toEqual(['completed']);
    expect(
      await screen.findByRole('button', { name: 'Concluída, 0 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('AGE-FLT-01/04: Dado o padrão, Quando desmarcar e marcar chips, Então a URL reflete o recorte e a contagem não muda', async () => {
    await renderAgenda();
    await screen.findByRole('button', { name: 'Agendada, 3 consultas' });

    await click(screen.getByRole('button', { name: 'Agendada, 3 consultas' }));
    await click(screen.getByRole('button', { name: 'Concluída, 0 consultas' }));

    expect(agenda.replaced.at(-1)).toBe('/agenda?status=confirmed%2Cno_show');
    await waitFor(() =>
      expect(lastStatuses()).toEqual(['confirmed', 'no_show']),
    );
    expect(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toBeTruthy();

    // Voltar ao padrão deixa a URL limpa.
    await click(screen.getByRole('button', { name: 'Agendada, 3 consultas' }));
    await click(screen.getByRole('button', { name: 'Concluída, 0 consultas' }));
    expect(agenda.replaced.at(-1)).toBe('/agenda');
  });

  it('AGE-FLT-04: Dado ?status=xyz, Quando abrir, Então cai no padrão sem erro', async () => {
    await renderAgenda('/agenda?status=xyz');

    expect(
      await screen.findByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('AGE-FLT-01: Dado nenhum status, Quando abrir, Então estado vazio com "Mostrar padrão" que restaura', async () => {
    await renderAgenda('/agenda?status=');

    expect(await screen.findByText('Nenhum status marcado.')).toBeTruthy();
    await click(screen.getByRole('button', { name: 'Mostrar padrão' }));

    await waitFor(() =>
      expect(screen.queryByText('Nenhum status marcado.')).toBeNull(),
    );
    expect(agenda.replaced.at(-1)).toBe('/agenda');
    expect(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Feature: Canceladas pedidas pelo filtro aparecem na grade (#538)', () => {
  const cancelled = dto('cancelled');
  const config = {
    weekdays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 18,
    minGapMinutes: 15,
    lunchBreak: { startMinute: 720, endMinute: 780 },
  };

  it('Dada cancelada e showCancelled, Quando layoutDay/visibleHours, Então entram no horário', () => {
    expect(layoutDay([cancelled])).toHaveLength(0);
    expect(layoutDay([cancelled], true)).toHaveLength(1);
    const early = {
      ...cancelled,
      startsAt: new Date(2026, 9, 22, 6).toISOString(),
      endsAt: new Date(2026, 9, 22, 7).toISOString(),
    };
    expect(visibleHours(config, [early]).startHour).toBe(8);
    expect(visibleHours(config, [early], true).startHour).toBe(6);
  });

  it('Dada cancelada, Quando o mês é filtrado por cancelada, Então vira linha da célula em vez de "+N mais"', () => {
    const props = {
      monthDate: new Date(2026, 9, 1),
      appointments: [cancelled],
      onDayClick: vi.fn(),
      onAppointmentClick: vi.fn(),
    };
    const { unmount } = render(<CalendarGrid {...props} />);
    expect(screen.getByText('+1 mais')).toBeTruthy();
    unmount();
    render(<CalendarGrid {...props} showCancelled />);
    expect(screen.queryByText('+1 mais')).toBeNull();
  });

  it('Dada cancelada, Quando a semana é filtrada por cancelada, Então mostra o bloco e não o resumo', () => {
    const props = {
      weekStart: new Date(2026, 9, 18),
      appointments: [cancelled],
      scheduleConfig: config,
      closures: [],
      professionalName: () => 'Prof',
      onDayClick: vi.fn(),
      onAppointmentClick: vi.fn(),
    };
    const { unmount } = render(<WeekView {...props} />);
    expect(screen.getByText('1 cancelada')).toBeTruthy();
    unmount();
    render(<WeekView {...props} showCancelled />);
    expect(screen.queryByText('1 cancelada')).toBeNull();
    expect(screen.getByRole('button', { name: /Paciente/ })).toBeTruthy();
  });
});

describe('Feature: A URL é a única fonte do filtro de status (#538)', () => {
  it('Dado ?status=cancelled aberto, Quando o roteador navega para /agenda sem parâmetros (clique em «Agenda» no menu), Então volta ao padrão', async () => {
    await renderAgenda('/agenda?status=cancelled');
    expect(
      await screen.findByRole('button', { name: 'Cancelada, 4 consultas' }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Clique em «Agenda» no menu: o roteador navega para /agenda sem parâmetros.
    await visit('/agenda');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(
      screen.getByRole('button', { name: 'Cancelada, 4 consultas' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('Dado o padrão, Quando o roteador navega para ?status=no_show, Então só Faltou fica marcada', async () => {
    await renderAgenda();
    await screen.findByRole('button', { name: 'Agendada, 3 consultas' });

    await visit('/agenda?status=no_show');

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Faltou, 2 consultas' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(
      screen.getByRole('button', { name: 'Agendada, 3 consultas' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
