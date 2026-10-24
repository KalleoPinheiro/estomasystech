// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import AgendaPage from '@/app/(staff)/agenda/page';
import { WeekView } from '@/app/(staff)/agenda/week-view';
import type { AppointmentDto } from '@/lib/dto';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/agenda',
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    const mockFetch = () => {
      const urls: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          urls.push(url);
          const data = url.startsWith('/api/schedule-config')
            ? { config: CONFIG, isDefault: false }
            : [];
          return {
            ok: true,
            json: async () => ({ success: true, data, error: null }),
          };
        }),
      );
      return urls;
    };

    const lastWindow = (urls: string[]) => {
      const url = urls
        .filter((candidate) => candidate.startsWith('/api/appointments?'))
        .at(-1) as string;
      const params = new URLSearchParams(url.split('?')[1]);
      return {
        from: new Date(params.get('from') as string),
        to: new Date(params.get('to') as string),
      };
    };

    it('Dada a agenda no mês, Quando escolher Dia, Então busca 1 dia e navega de dia em dia', async () => {
      const urls = mockFetch();
      renderWithToast(<AgendaPage />);
      await screen.findByLabelText('Mês anterior');

      fireEvent.click(screen.getByRole('button', { name: 'Dia' }));

      await screen.findByLabelText('Dia anterior');
      await waitFor(() => {
        const { from, to } = lastWindow(urls);
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(
          1,
        );
      });
      expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      const before = lastWindow(urls).from;
      fireEvent.click(screen.getByLabelText('Próximo dia'));
      await waitFor(() => {
        const after = lastWindow(urls).from;
        expect(
          Math.round((after.getTime() - before.getTime()) / 86_400_000),
        ).toBe(1);
      });
    });

    it('Dada a visão Dia, Quando voltar para Semana e para Mês, Então a navegação acompanha a visão', async () => {
      const urls = mockFetch();
      renderWithToast(<AgendaPage />);
      await screen.findByLabelText('Mês anterior');

      fireEvent.click(screen.getByRole('button', { name: 'Dia' }));
      await screen.findByLabelText('Dia anterior');

      fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
      await screen.findByLabelText('Semana anterior');
      await waitFor(() => {
        const { from, to } = lastWindow(urls);
        expect(from.getDay()).toBe(0);
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(
          7,
        );
      });

      fireEvent.click(screen.getByRole('button', { name: 'Mês' }));
      expect(await screen.findByLabelText('Mês anterior')).toBeInTheDocument();
    });
  });
});
