// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockDensity } from '@/app/(staff)/agenda/week-layout';
import { WeekView } from '@/app/(staff)/agenda/week-view';
import type { AppointmentDto } from '@/lib/dto';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const at = (hour: number, minute = 0) =>
  new Date(2026, 9, 22, hour, minute).toISOString();

const CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  lunchBreak: null,
};

const appointment = (startsAt: string, endsAt: string): AppointmentDto => ({
  id: 'a',
  patientId: 'pat-a',
  patientName: 'Meire Saraiva',
  startsAt,
  endsAt,
  procedure: 'Troca de bolsa de estomia',
  priceCents: 9000,
  notes: null,
  status: 'scheduled',
  professionalId: null,
  cancelledBy: null,
  cancelledAt: null,
  cancelReason: null,
  cancelledLate: false,
});

const renderDay = (item: AppointmentDto) =>
  render(
    <WeekView
      weekStart={new Date(2026, 9, 22)}
      dayCount={1}
      appointments={[item]}
      scheduleConfig={CONFIG}
      closures={[]}
      professionalName={() => 'Profissional'}
      onDayClick={vi.fn()}
      onAppointmentClick={vi.fn()}
    />,
  );

describe('Feature: bloco de consulta curta legível na agenda (#539)', () => {
  describe('Cenário: quanto cabe no bloco pela duração', () => {
    it.each([
      [60, 'full'],
      [45, 'full'],
      [44, 'single'],
      [30, 'single'],
      [29, 'tiny'],
      [15, 'tiny'],
    ] as const)(
      'Dada uma consulta de %i min, Quando medir o bloco, Então a densidade é %s',
      (minutes, expected) => {
        const end = at(9 + Math.floor(minutes / 60), minutes % 60);

        expect(blockDensity(at(9), end)).toBe(expected);
      },
    );
  });

  describe('Cenário: texto do bloco', () => {
    it('Dada uma consulta de 30 min, Quando abrir o dia, Então hora, paciente e procedimento ficam numa só linha', () => {
      renderDay(appointment(at(11), at(11, 30)));

      const line = screen.getByText(
        /11:00 Meire Saraiva · Troca de bolsa de estomia/,
      );
      expect(line).toBeInTheDocument();
      expect(line.closest('button')).toHaveClass('min-h-0', 'leading-4');
      expect(line.closest('button')).toHaveAttribute(
        'title',
        '11:00–11:30 Meire Saraiva — Troca de bolsa de estomia',
      );
    });

    it('Dada uma consulta de 15 min, Quando abrir o dia, Então a linha única usa a entrelinha mínima', () => {
      renderDay(appointment(at(11), at(11, 15)));

      const line = screen.getByText(/11:00 Meire Saraiva · Troca de bolsa/);
      expect(line.closest('button')).toHaveClass('min-h-0', 'leading-3.5');
      expect(line.closest('button')).toHaveAccessibleName(
        '11:00–11:15 Meire Saraiva — Troca de bolsa de estomia',
      );
    });

    it('Dada uma consulta de 60 min, Quando abrir o dia, Então hora e procedimento seguem em duas linhas', () => {
      renderDay(appointment(at(11), at(12)));

      expect(screen.getByText(/11:00–12:00 Meire Saraiva/)).toBeInTheDocument();
      expect(screen.getByText('Troca de bolsa de estomia')).toBeInTheDocument();
    });
  });

  describe('Cenário: homônimos no mesmo dia', () => {
    it('Dados dois pacientes homônimos, Quando abrir o dia, Então o nome acessível de cada bloco traz o nascimento', () => {
      const maria = (
        id: string,
        patientId: string,
        birth: string,
        h: number,
      ) => ({
        ...appointment(at(h), at(h, 30)),
        id,
        patientId,
        patientName: 'Maria Silva',
        patientBirthDate: birth,
      });
      render(
        <WeekView
          weekStart={new Date(2026, 9, 22)}
          dayCount={1}
          appointments={[
            maria('a1', 'pat-1', '1950-01-02', 9),
            maria('a2', 'pat-2', '1971-05-10', 10),
          ]}
          scheduleConfig={CONFIG}
          closures={[]}
          professionalName={() => 'Profissional'}
          onDayClick={vi.fn()}
          onAppointmentClick={vi.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: /09:00.*nasc\. 02\/01\/1950/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /10:00.*nasc\. 10\/05\/1971/ }),
      ).toBeInTheDocument();
    });
  });
});
