'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  type AgendaQuery,
  type AgendaView,
  type AgendaWindow,
  agendaHref,
  anchorForView,
  parseDayKey,
  resolveAgendaWindow,
  shiftAnchor,
} from './agenda-range';
import { dayKey } from './calendar-days';

export type { AgendaView } from './agenda-range';

/** O que muda no recorte: valores novos, ou uma função do recorte mais recente pedido (`null` = nada a fazer). */
export type NavigationChange =
  | Partial<AgendaQuery>
  | ((latest: AgendaQuery) => Partial<AgendaQuery> | null);

export interface AgendaPeriod extends AgendaWindow {
  setView: (view: AgendaView, options?: { replace?: boolean }) => void;
  shift: (delta: number) => void;
}

export interface AgendaPeriodState extends AgendaPeriod {
  /** Dia escolhido no mês compacto do celular: a visão Semana/Dia abre nele (#591). */
  chooseDay: (day: Date) => void;
  /** Há uma navegação a caminho: a URL já mudou e o servidor ainda não respondeu. */
  pending: boolean;
  /** Vai a outro recorte (status, profissional) mantendo o período, sem criar entrada no histórico. */
  navigate: (next: NavigationChange, options?: { replace?: boolean }) => void;
}

/**
 * Período da agenda: mês (padrão), semana ou dia. A URL é a fonte da verdade
 * (#551): o servidor lê `?visao`, `?dia`, `?status` e `?profissional` e manda
 * as consultas desse recorte; aqui cada mudança vira navegação (`router.push`
 * dentro de uma transição, então a tela atual fica no lugar até a resposta
 * chegar). Só o dia escolhido no mês do celular é estado local.
 */
export function useAgendaPeriod(query: AgendaQuery): AgendaPeriodState {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Date | null>(null);
  // Último destino pedido enquanto o servidor responde: cliques seguidos somam
  // (dois «próximo» andam dois períodos; trocar o status e o profissional não se desfazem).
  const queued = useRef<AgendaQuery | null>(null);
  useEffect(() => {
    if (!pending) queued.current = null;
  }, [pending]);
  const { view, anchor, professionalId } = query;
  // Chave estável dos status: o array da página é novo a cada renderização.
  const statusKey = query.statuses.join(',');

  return useMemo(() => {
    const anchorDay = parseDayKey(anchor) ?? new Date();
    const window = resolveAgendaWindow(view, anchorDay);
    const statuses = (
      statusKey === '' ? [] : statusKey.split(',')
    ) as AgendaQuery['statuses'];
    const current: AgendaQuery = { view, anchor, statuses, professionalId };
    const navigate = (
      next: NavigationChange,
      options: { replace?: boolean } = {},
    ) => {
      const latest = queued.current ?? current;
      const change = typeof next === 'function' ? next(latest) : next;
      if (!change) return;
      const target = { ...latest, ...change };
      queued.current = target;
      const href = agendaHref(target);
      startTransition(() => {
        if (options.replace) {
          router.replace(href, { scroll: false });
        } else {
          router.push(href, { scroll: false });
        }
      });
    };
    return {
      ...window,
      pending,
      navigate,
      chooseDay: (day: Date) =>
        setPicked(new Date(day.getFullYear(), day.getMonth(), day.getDate())),
      setView: (next: AgendaView, options?: { replace?: boolean }) => {
        navigate((latest) => {
          if (next === latest.view) return null;
          const latestDay = parseDayKey(latest.anchor) ?? anchorDay;
          const latestWindow = resolveAgendaWindow(latest.view, latestDay);
          const target = anchorForView(latest.view, next, latestWindow, picked);
          return { view: next, anchor: dayKey(target) };
        }, options);
      },
      shift: (delta: number) => {
        setPicked(null);
        navigate((latest) => {
          const latestDay = parseDayKey(latest.anchor) ?? anchorDay;
          return {
            anchor: dayKey(shiftAnchor(latest.view, latestDay, delta)),
          };
        });
      },
    };
  }, [view, anchor, statusKey, professionalId, picked, pending, router]);
}
