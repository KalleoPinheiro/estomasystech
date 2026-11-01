// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgendaPeriod } from '@/app/(staff)/agenda/agenda-period';
import { PeriodNav } from '@/app/(staff)/agenda/period-nav';

afterEach(cleanup);

const period = (view: AgendaPeriod['view'] = 'month'): AgendaPeriod => ({
  view,
  setView: vi.fn(),
  monthDate: new Date(2026, 9, 1),
  weekStart: new Date(2026, 9, 18),
  dayDate: new Date(2026, 9, 22),
  from: new Date(2026, 9, 1),
  to: new Date(2026, 10, 1),
  closuresFrom: '2026-09-24',
  closuresTo: '2026-11-07',
  label: 'Outubro de 2026',
  shift: vi.fn(),
});

describe('Feature: seletor de visão da agenda (#582)', () => {
  it('Dado o celular, Quando renderizar, Então oferece Mês e Dia, sem Semana', () => {
    render(<PeriodNav period={period()} compact />);

    const group = screen.getByRole('group', { name: 'Visão da agenda' });
    expect(group).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mês' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dia' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
  });

  it('Dado o desktop, Quando renderizar, Então oferece Mês, Semana e Dia', () => {
    render(<PeriodNav period={period()} compact={false} />);

    for (const name of ['Mês', 'Semana', 'Dia']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('Dado o celular, Quando tocar em Dia, Então troca a visão para o dia', () => {
    const p = period();
    render(<PeriodNav period={p} compact />);

    fireEvent.click(screen.getByRole('button', { name: 'Dia' }));

    expect(p.setView).toHaveBeenCalledWith('day');
  });
});
