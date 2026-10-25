// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekView } from '@/app/(staff)/agenda/week-view';
import type { AppointmentDto } from '@/lib/dto';

afterEach(cleanup);

const CONFIG = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
  lunchBreak: { startMinute: 720, endMinute: 780 },
};

const renderWeek = (props: {
  appointments: AppointmentDto[];
  loading?: boolean;
}) =>
  render(
    <WeekView
      weekStart={new Date(2026, 9, 18)}
      appointments={props.appointments}
      loading={props.loading}
      scheduleConfig={CONFIG}
      closures={[]}
      professionalName={() => 'Prof'}
      onDayClick={vi.fn()}
      onAppointmentClick={vi.fn()}
    />,
  );

describe('Feature: Semana e Dia durante a busca (#588)', () => {
  describe('Cenário: busca em andamento', () => {
    it('Dado a busca em andamento, Quando a semana é desenhada, Então as 7 colunas existem, marcadas como ocupadas, sem «Nenhuma consulta»', () => {
      const { container } = renderWeek({ appointments: [], loading: true });

      expect(container.querySelectorAll('[data-week-day]')).toHaveLength(7);
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(screen.getByText('Carregando…')).toBeTruthy();
      expect(screen.queryByText(/Nenhuma consulta/)).toBeNull();
    });
  });

  describe('Cenário: busca concluída', () => {
    it('Dado a busca concluída sem consultas, Então aparece «Nenhuma consulta» e a grade não está ocupada', () => {
      const { container } = renderWeek({ appointments: [] });

      expect(container.querySelector('[aria-busy]')).toBeNull();
      expect(screen.queryByText('Carregando…')).toBeNull();
      expect(screen.getByText(/Nenhuma consulta/)).toBeTruthy();
      expect(container.querySelectorAll('[data-week-day]')).toHaveLength(7);
    });
  });
});
