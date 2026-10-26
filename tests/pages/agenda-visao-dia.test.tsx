// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekView } from '@/app/(staff)/agenda/week-view';
import type { AppointmentDto } from '@/lib/dto';
import {
  click,
  lastListWindow,
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

afterEach(() => {
  cleanup();
});

// Quinta-feira 22/10/2026.
const THURSDAY = new Date(2026, 9, 22);
const CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  lunchBreak: { startMinute: 720, endMinute: 780 },
};

const at = (day: number, hour: number) =>
  new Date(2026, 9, day, hour, 0).toISOString();

const appointment = (id: string, day: number, hour: number): AppointmentDto =>
  ({
    id,
    patientId: `pat-${id}`,
    patientName: `Paciente ${id}`,
    startsAt: at(day, hour),
    endsAt: at(day, hour + 1),
    procedure: 'Curativo',
    priceCents: 9000,
    notes: null,
    status: 'scheduled',
    professionalId: 'prof-1',
  }) as unknown as AppointmentDto;

describe('Feature: Agenda por dia (visão Dia)', () => {
  describe('Cenário: grade de um único dia', () => {
    const renderDay = (appointments: AppointmentDto[]) =>
      render(
        <WeekView
          weekStart={THURSDAY}
          dayCount={1}
          appointments={appointments}
          scheduleConfig={CONFIG}
          closures={[]}
          professionalName={() => 'Prof'}
          onDayClick={vi.fn()}
          onAppointmentClick={vi.fn()}
        />,
      );

    it('Dado um dia com 4 consultas, Quando abrir a visão Dia, Então há uma só coluna com as 4 consultas à vista', () => {
      const { container } = renderDay([
        appointment('1', 22, 9),
        appointment('2', 22, 10),
        appointment('3', 22, 11),
        appointment('4', 22, 14),
      ]);

      expect(container.querySelectorAll('[data-week-day]')).toHaveLength(1);
      for (const id of ['1', '2', '3', '4']) {
        expect(screen.getByText(new RegExp(`Paciente ${id}`))).toBeVisible();
      }
      expect(screen.queryByText(/mais/)).not.toBeInTheDocument();
    });

    it('Dado um dia sem consultas, Quando abrir a visão Dia, Então avisa que não há consulta neste dia', () => {
      renderDay([]);

      expect(
        screen.getByText('Nenhuma consulta agendada neste dia.'),
      ).toBeInTheDocument();
    });
  });

  describe('Cenário: escolha da visão na página', () => {
    it('Dada a agenda no mês, Quando escolher Dia, Então busca 1 dia e navega de dia em dia', async () => {
      resetAgenda({ scheduleConfig: CONFIG });
      await renderAgenda();
      await screen.findByLabelText('Mês anterior');

      await click(screen.getByRole('button', { name: 'Dia' }));

      await screen.findByLabelText('Dia anterior');
      await waitFor(() => {
        const { from, to } = lastListWindow();
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(
          1,
        );
      });
      expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      const before = lastListWindow().from;
      await click(screen.getByLabelText('Próximo dia'));
      await waitFor(() => {
        const after = lastListWindow().from;
        expect(
          Math.round((after.getTime() - before.getTime()) / 86_400_000),
        ).toBe(1);
      });
    });

    it('Dada a visão Dia, Quando voltar para Semana e para Mês, Então a navegação acompanha a visão', async () => {
      resetAgenda({ scheduleConfig: CONFIG });
      await renderAgenda();
      await screen.findByLabelText('Mês anterior');

      await click(screen.getByRole('button', { name: 'Dia' }));
      await screen.findByLabelText('Dia anterior');

      await click(screen.getByRole('button', { name: 'Semana' }));
      await screen.findByLabelText('Semana anterior');
      await waitFor(() => {
        const { from, to } = lastListWindow();
        expect(from.getDay()).toBe(0);
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(
          7,
        );
      });

      await click(screen.getByRole('button', { name: 'Mês' }));
      expect(await screen.findByLabelText('Mês anterior')).toBeInTheDocument();
    });
  });
});
