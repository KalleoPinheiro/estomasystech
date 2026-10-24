'use client';

import { useMemo, useState } from 'react';
import { clinicDayCell } from '@/lib/clinic-calendar';
import { dayKey } from './calendar-days';

export type AgendaView = 'month' | 'week' | 'day';

/** Domingo da semana de `date` (a grade do mês também começa no domingo). */
export function startOfWeek(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay(),
  );
}

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Só a primeira letra maiúscula ("Agosto de 2026"): `capitalize` do Tailwind maiusculiza a preposição. */
export const monthLabel = (date: Date): string => {
  const raw = date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

/** "18 a 24 de outubro de 2026" (ou com os dois meses, quando a semana vira o mês). */
export function weekLabel(weekStart: Date): string {
  const last = addDays(weekStart, 6);
  const day = (date: Date) => String(date.getDate());
  const month = (date: Date) =>
    date.toLocaleDateString('pt-BR', { month: 'long' });
  const tail = `${last.getFullYear()}`;
  return weekStart.getMonth() === last.getMonth()
    ? `${day(weekStart)} a ${day(last)} de ${month(last)} de ${tail}`
    : `${day(weekStart)} de ${month(weekStart)} a ${day(last)} de ${month(last)} de ${tail}`;
}

/** "Quinta-feira, 22 de outubro de 2026". */
export function dayLabel(date: Date): string {
  const raw = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Dia em que a visão entra: hoje, se cair no período exibido; senão o primeiro dia dele. */
function entryDay(from: Date, to: Date): Date {
  const today = clinicDayCell();
  return today >= from && today < to ? today : from;
}

export interface AgendaPeriod {
  view: AgendaView;
  setView: (view: AgendaView) => void;
  /** Primeiro dia do mês exibido (visão mensal). */
  monthDate: Date;
  /** Domingo da semana exibida (visão semanal). */
  weekStart: Date;
  /** Dia exibido (visão diária). */
  dayDate: Date;
  /** Janela das consultas: `from` incluso, `to` exclusivo. */
  from: Date;
  to: Date;
  /** Janela dos feriados/ausências (a grade do mês mostra dias dos meses vizinhos). */
  closuresFrom: string;
  closuresTo: string;
  label: string;
  shift: (delta: number) => void;
}

/** Período da agenda: mês (padrão), semana ou dia, com navegação para frente e para trás. */
export function useAgendaPeriod(initial: Date): AgendaPeriod {
  const [view, setViewState] = useState<AgendaView>('month');
  const [anchor, setAnchor] = useState(() => {
    const day = clinicDayCell(initial);
    return new Date(day.getFullYear(), day.getMonth(), 1);
  });

  return useMemo(() => {
    const monthDate = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const weekStart = startOfWeek(anchor);
    const dayDate = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
    );
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      1,
    );
    const span = {
      month: { from: monthDate, to: monthEnd },
      week: { from: weekStart, to: addDays(weekStart, 7) },
      day: { from: dayDate, to: addDays(dayDate, 1) },
    }[view];
    const closuresFrom =
      view === 'month'
        ? new Date(monthDate.getFullYear(), monthDate.getMonth(), -6)
        : span.from;
    const closuresTo =
      view === 'month'
        ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 7)
        : addDays(span.to, -1);

    const setView = (next: AgendaView) => {
      if (next === view) return;
      if (next === 'month') {
        setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
      } else if (view === 'month') {
        // De mês para semana/dia: hoje, se está no mês exibido; senão o dia 1.
        setAnchor(entryDay(monthDate, monthEnd));
      } else if (next === 'day') {
        // De semana para dia: hoje, se está na semana exibida; senão o domingo.
        setAnchor(entryDay(weekStart, addDays(weekStart, 7)));
      }
      setViewState(next);
    };

    return {
      view,
      setView,
      monthDate,
      weekStart,
      dayDate,
      from: span.from,
      to: span.to,
      closuresFrom: dayKey(closuresFrom),
      closuresTo: dayKey(closuresTo),
      label: {
        month: monthLabel(monthDate),
        week: weekLabel(weekStart),
        day: dayLabel(dayDate),
      }[view],
      shift: (delta: number) =>
        setAnchor((prev) => {
          if (view === 'day') return addDays(prev, delta);
          if (view === 'week') return addDays(prev, delta * 7);
          return new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
        }),
    };
  }, [anchor, view]);
}
