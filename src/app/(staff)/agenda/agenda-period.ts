'use client';

import { useMemo, useState } from 'react';
import { dayKey } from './calendar-days';

export type AgendaView = 'month' | 'week';

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

export interface AgendaPeriod {
  view: AgendaView;
  setView: (view: AgendaView) => void;
  /** Primeiro dia do mês exibido (visão mensal). */
  monthDate: Date;
  /** Domingo da semana exibida (visão semanal). */
  weekStart: Date;
  /** Janela das consultas: `from` incluso, `to` exclusivo. */
  from: Date;
  to: Date;
  /** Janela dos feriados/ausências (a grade do mês mostra dias dos meses vizinhos). */
  closuresFrom: string;
  closuresTo: string;
  label: string;
  shift: (delta: number) => void;
}

/** Período da agenda: mês (padrão) ou semana, com navegação para frente e para trás. */
export function useAgendaPeriod(initial: Date): AgendaPeriod {
  const [view, setViewState] = useState<AgendaView>('month');
  const [anchor, setAnchor] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  return useMemo(() => {
    const monthDate = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const weekStart = startOfWeek(anchor);
    const isWeek = view === 'week';
    const from = isWeek ? weekStart : monthDate;
    const to = isWeek
      ? addDays(weekStart, 7)
      : new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    const closuresFrom = isWeek
      ? weekStart
      : new Date(monthDate.getFullYear(), monthDate.getMonth(), -6);
    const closuresTo = isWeek
      ? addDays(weekStart, 6)
      : new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 7);

    const setView = (next: AgendaView) => {
      if (next === view) return;
      if (next === 'week') {
        // Semana de hoje, se hoje está no mês exibido; senão a do dia 1.
        const today = new Date();
        const sameMonth =
          today.getFullYear() === monthDate.getFullYear() &&
          today.getMonth() === monthDate.getMonth();
        setAnchor(sameMonth ? today : monthDate);
      } else {
        setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
      }
      setViewState(next);
    };

    return {
      view,
      setView,
      monthDate,
      weekStart,
      from,
      to,
      closuresFrom: dayKey(closuresFrom),
      closuresTo: dayKey(closuresTo),
      label: isWeek ? weekLabel(weekStart) : monthLabel(monthDate),
      shift: (delta: number) =>
        setAnchor((prev) =>
          isWeek
            ? addDays(prev, delta * 7)
            : new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
        ),
    };
  }, [anchor, view]);
}
