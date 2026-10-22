// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithToast } from '@/../tests/support/render-with-toast';
import { CalendarGrid } from '@/app/(staff)/agenda/calendar-grid';
import AgendaPage from '@/app/(staff)/agenda/page';
import {
  layoutDay,
  verticalSpan,
  visibleHours,
} from '@/app/(staff)/agenda/week-layout';
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

// Domingo 18/10/2026: a semana de 18 a 24 (quinta = 22).
const SUNDAY = new Date(2026, 9, 18);
const CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  lunchBreak: { startMinute: 720, endMinute: 780 },
};

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const appointment = (
  id: string,
  startsAt: string,
  endsAt: string,
  extra: Partial<AppointmentDto> = {},
): AppointmentDto => ({
  id,
  patientId: `pat-${id}`,
  patientName: `Paciente ${id}`,
  startsAt,
  endsAt,
  procedure: 'Curativo',
  priceCents: 9000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
  ...extra,
});

describe('Feature: Agenda por semana com blocos do tamanho da consulta (#471)', () => {
  describe('Cenário: distribuição das consultas no dia', () => {
    it('Dadas duas consultas que se sobrepõem, Quando distribuir, Então ficam lado a lado em duas raias', () => {
      const placed = layoutDay([
        appointment('a', at(22, 9), at(22, 10)),
        appointment('b', at(22, 9, 30), at(22, 10, 30)),
      ]);

      expect(placed.map((item) => [item.lane, item.lanes])).toEqual([
        [0, 2],
        [1, 2],
      ]);
    });

    it('Dadas consultas em sequência, Quando distribuir, Então cada uma ocupa a coluna inteira', () => {
      const placed = layoutDay([
        appointment('a', at(22, 9), at(22, 10)),
        appointment('b', at(22, 10), at(22, 11)),
      ]);

      expect(placed.map((item) => item.lanes)).toEqual([1, 1]);
    });

    it('Dada uma consulta cancelada, Quando distribuir, Então ela não ocupa horário', () => {
      const placed = layoutDay([
        appointment('a', at(22, 9), at(22, 10), { status: 'cancelled' }),
        appointment('b', at(22, 9), at(22, 10)),
      ]);

      expect(placed).toHaveLength(1);
      expect(placed[0].lanes).toBe(1);
    });

    it('Dada uma consulta antes da grade, Quando calcular as horas, Então a faixa se amplia para caber', () => {
      const range = visibleHours(CONFIG, [
        appointment('a', at(22, 7), at(22, 8)),
        appointment('b', at(22, 17), at(22, 19)),
      ]);

      expect(range).toEqual({ startHour: 7, endHour: 19 });
    });

    it('Dada uma consulta de 1 hora numa grade de 10 horas, Quando posicionar, Então ocupa 10% da altura', () => {
      const span = verticalSpan(at(22, 9), at(22, 10), {
        startHour: 8,
        endHour: 18,
      });

      expect(span.top).toBeCloseTo(10);
      expect(span.height).toBeCloseTo(10);
    });
  });

  describe('Cenário: visão semanal', () => {
    const renderWeek = (appointments: AppointmentDto[], handlers = {}) =>
      render(
        <WeekView
          weekStart={SUNDAY}
          appointments={appointments}
          scheduleConfig={CONFIG}
          closures={[]}
          professionalName={() => 'Profissional'}
          onDayClick={vi.fn()}
          onAppointmentClick={vi.fn()}
          {...handlers}
        />,
      );

    it('Dada uma consulta de 90 minutos, Quando abrir a semana, Então o bloco tem a altura proporcional à duração', () => {
      renderWeek([appointment('a', at(22, 9), at(22, 10, 30))]);

      const column = document.querySelector('[data-week-day="2026-10-22"]');
      const block = within(column as HTMLElement).getByTitle(/Paciente a/);
      expect(block).toHaveStyle({ top: '10%', height: '15%' });
    });

    it('Dadas duas consultas no mesmo horário, Quando abrir a semana, Então os blocos dividem a coluna', () => {
      renderWeek([
        appointment('a', at(22, 9), at(22, 10)),
        appointment('b', at(22, 9), at(22, 10)),
      ]);

      const [first, second] = ['a', 'b'].map((id) =>
        screen.getByTitle(new RegExp(`Paciente ${id}`)),
      );
      expect(first.style.width).toBe('calc(50% - 2px)');
      expect(second.style.left).toBe('calc(50% + 1px)');
    });

    it('Dada uma consulta cancelada, Quando abrir a semana, Então não há bloco e a coluna avisa', () => {
      renderWeek([
        appointment('a', at(22, 9), at(22, 10), { status: 'cancelled' }),
      ]);

      expect(screen.queryByTitle(/Paciente a/)).not.toBeInTheDocument();
      expect(screen.getByText('1 cancelada')).toBeInTheDocument();
    });

    it('Dada a pausa de almoço configurada, Quando abrir a semana, Então a faixa do almoço aparece sombreada', () => {
      renderWeek([]);

      const column = document.querySelector('[data-week-day="2026-10-22"]');
      expect(
        (column as HTMLElement).querySelector(
          '[style*="top: 40%"][style*="height"]',
        ),
      ).toHaveStyle({ height: '10%' });
    });

    it('Quando clicar no bloco, Então abre a consulta; quando clicar no dia vazio, Então começa uma nova', () => {
      const onAppointmentClick = vi.fn();
      const onDayClick = vi.fn();
      const target = appointment('a', at(22, 9), at(22, 10));
      renderWeek([target], { onAppointmentClick, onDayClick });

      fireEvent.click(screen.getByTitle(/Paciente a/));
      fireEvent.click(screen.getByLabelText('Nova consulta em 22/10/2026'));

      expect(onAppointmentClick).toHaveBeenCalledWith(target);
      expect(onDayClick).toHaveBeenCalledTimes(1);
      expect(onDayClick.mock.calls[0][0].getDate()).toBe(22);
    });

    it('Dado um dia fora da grade (sábado), Quando abrir a semana, Então não oferece nova consulta nele', () => {
      renderWeek([]);

      expect(
        screen.queryByLabelText('Nova consulta em 24/10/2026'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Cenário: "+N mais" na visão do mês', () => {
    const crowded = [
      appointment('1', at(22, 9), at(22, 10)),
      appointment('2', at(22, 11), at(22, 12)),
      appointment('3', at(22, 12, 30), at(22, 13, 30)),
      appointment('4', at(22, 14), at(22, 15)),
      appointment('5', at(22, 8), at(22, 8, 30), { status: 'cancelled' }),
    ];

    it('Dado dia com 4 consultas e uma cancelada, Quando clicar em "+N mais", Então lista todas, inclusive a cancelada', () => {
      const onAppointmentClick = vi.fn();
      render(
        <CalendarGrid
          monthDate={new Date(2026, 9, 1)}
          appointments={crowded}
          onDayClick={vi.fn()}
          onAppointmentClick={onAppointmentClick}
        />,
      );

      // A cancelada não ocupa linha: as 3 primeiras ativas ficam à vista e sobra 1 ativa + 1 cancelada.
      expect(screen.queryByText(/Paciente 4/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('+2 mais'));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(5);
      fireEvent.click(within(dialog).getByText(/Paciente 4/));
      expect(onAppointmentClick).toHaveBeenCalledWith(crowded[3]);
    });

    it('Quando clicar em "+N mais", Então não abre Nova consulta', () => {
      const onDayClick = vi.fn();
      render(
        <CalendarGrid
          monthDate={new Date(2026, 9, 1)}
          appointments={crowded}
          onDayClick={onDayClick}
          onAppointmentClick={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText('+2 mais'));

      expect(onDayClick).not.toHaveBeenCalled();
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

    it('Dada a agenda no mês, Quando escolher Semana, Então busca 7 dias a partir do domingo e navega por semana', async () => {
      const urls = mockFetch();
      renderWithToast(<AgendaPage />);
      await screen.findByLabelText('Mês anterior');

      fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

      await screen.findByLabelText('Semana anterior');
      await waitFor(() => {
        const weekUrl = urls
          .filter((url) => url.startsWith('/api/appointments?'))
          .at(-1) as string;
        const params = new URLSearchParams(weekUrl.split('?')[1]);
        const from = new Date(params.get('from') as string);
        const to = new Date(params.get('to') as string);
        expect(from.getDay()).toBe(0);
        expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(
          7,
        );
      });
      expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Mês' }));
      expect(await screen.findByLabelText('Mês anterior')).toBeInTheDocument();
    });
  });
});
