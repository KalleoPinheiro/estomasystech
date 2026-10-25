import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import {
  parseStatusFilter,
  serializeStatusFilter,
} from '@/domain/scheduling/appointment-status-filter';
import { clinicDayCell } from '@/lib/clinic-calendar';
import { dayKey } from './calendar-days';

/**
 * Período da agenda (mês, semana ou dia) como função pura do que está na URL.
 * Sem `'use client'` de propósito: a página no servidor calcula a janela das
 * consultas e a tela no cliente calcula os mesmos rótulos e os mesmos links
 * (#551). Os dias são «células de calendário» (`Date` à meia-noite local com o
 * ano/mês/dia do dia da clínica); entre servidor e cliente só viajam chaves
 * `AAAA-MM-DD`.
 */

export type AgendaView = 'month' | 'week' | 'day';

const VIEW_PARAM: Record<AgendaView, string | null> = {
  month: null,
  week: 'semana',
  day: 'dia',
};

/** Domingo da semana de `date` (a grade do mês também começa no domingo). */
export function startOfWeek(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay(),
  );
}

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

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
export function entryDay(from: Date, to: Date): Date {
  const today = clinicDayCell();
  return today >= from && today < to ? today : from;
}

export interface AgendaWindow {
  view: AgendaView;
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
}

/** Janela e rótulo da visão `view` ancorada no dia `anchor`. */
export function resolveAgendaWindow(
  view: AgendaView,
  anchor: Date,
): AgendaWindow {
  const monthDate = startOfMonth(anchor);
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
  return {
    view,
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
  };
}

/** `AAAA-MM-DD` válido → célula de calendário; qualquer outra coisa (inclusive 31/02) → `null`. */
export function parseDayKey(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const date = new Date(year, month - 1, day);
  return dayKey(date) === value ? date : null;
}

/** Estado da agenda na URL: visão, dia de ancoragem, recorte de status e profissional. */
export interface AgendaQuery {
  view: AgendaView;
  /** Dia de ancoragem (`AAAA-MM-DD`); na visão mensal vale o mês dele. */
  anchor: string;
  statuses: readonly AppointmentStatus[];
  /** Filtro por profissional; `''` = todos. */
  professionalId: string;
}

/** O que a URL leva além do estado: recall de 1 clique e link do Google Agenda. */
export interface AgendaEntry {
  recall: { followUpId: string; patientId: string; procedure: string } | null;
  consultation: { id: string; startsAt: string } | null;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Visão pedida na URL; valor ausente ou desconhecido cai no mês (padrão). */
function parseView(value: string | undefined): AgendaView {
  return (
    (Object.keys(VIEW_PARAM) as AgendaView[]).find(
      (view) => VIEW_PARAM[view] !== null && VIEW_PARAM[view] === value,
    ) ?? 'month'
  );
}

/**
 * Lê `?visao=semana|dia`, `?dia=AAAA-MM-DD`, `?status=` e `?profissional=`
 * (#551, AGE-FLT-04): link compartilhado e recarregar mantêm o recorte, e a URL
 * é a única fonte da seleção. Valor inválido cai no padrão sem erro. O link do
 * Google Agenda (`?consulta=<id>&em=<início ISO>`, #217) abre o mês da consulta
 * quando a URL não traz `dia`; `em` inválido é ignorado.
 */
export function parseAgendaQuery(params: SearchParams): {
  query: AgendaQuery;
  entry: AgendaEntry;
} {
  const consultationId = first(params.consulta);
  const startsAt = new Date(first(params.em) ?? '');
  const consultation =
    consultationId && !Number.isNaN(startsAt.getTime())
      ? { id: consultationId, startsAt: startsAt.toISOString() }
      : null;
  const followUpId = first(params.followUpId);
  const anchor =
    parseDayKey(first(params.dia)) ??
    clinicDayCell(consultation ? new Date(consultation.startsAt) : new Date());
  return {
    query: {
      view: parseView(first(params.visao)),
      anchor: dayKey(anchor),
      statuses: parseStatusFilter(first(params.status) ?? null),
      professionalId: first(params.profissional) ?? '',
    },
    entry: {
      consultation,
      recall: followUpId
        ? {
            followUpId,
            patientId: first(params.patientId) ?? '',
            procedure: first(params.procedure) ?? '',
          }
        : null,
    },
  };
}

/** Mesma janela que a visão teria sem `dia` na URL (hoje): o link então não precisa carregá-lo. */
function isDefaultAnchor(view: AgendaView, anchor: Date): boolean {
  const today = resolveAgendaWindow(view, clinicDayCell());
  const target = resolveAgendaWindow(view, anchor);
  return dayKey(target.from) === dayKey(today.from);
}

/**
 * Link da agenda para `query`. O padrão deixa a URL limpa: mês sem `visao`,
 * período de hoje sem `dia`, status padrão sem `status`, todos os profissionais
 * sem `profissional`. Recall e link do Google não são levados adiante.
 */
export function agendaHref(query: AgendaQuery): string {
  const params = new URLSearchParams();
  const view = VIEW_PARAM[query.view];
  if (view) {
    params.set('visao', view);
  }
  const anchor = parseDayKey(query.anchor);
  if (anchor && !isDefaultAnchor(query.view, anchor)) {
    params.set('dia', query.anchor);
  }
  const status = serializeStatusFilter(query.statuses);
  if (status !== null) {
    params.set('status', status);
  }
  if (query.professionalId) {
    params.set('profissional', query.professionalId);
  }
  const text = params.toString();
  return text ? `/agenda?${text}` : '/agenda';
}

/** Dia de ancoragem ao deslocar `delta` períodos (mês: dia 1 do mês vizinho). */
export function shiftAnchor(
  view: AgendaView,
  anchor: Date,
  delta: number,
): Date {
  if (view === 'day') {
    return addDays(anchor, delta);
  }
  if (view === 'week') {
    return addDays(anchor, delta * 7);
  }
  return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
}

/**
 * Dia de ancoragem ao trocar de visão. Para o mês, o dia 1 do mês exibido. Do
 * mês para semana/dia, o dia escolhido no mês compacto do celular (#591) ou,
 * sem escolha, hoje (se está no mês) ou o dia 1. Da semana para o dia, hoje (se
 * está na semana) ou o domingo. Do dia para a semana, o mesmo dia.
 */
export function anchorForView(
  from: AgendaView,
  to: AgendaView,
  current: AgendaWindow,
  picked: Date | null,
): Date {
  if (to === 'month') {
    return current.monthDate;
  }
  if (from === 'month') {
    return picked ?? entryDay(current.monthDate, current.to);
  }
  if (to === 'day') {
    return entryDay(current.weekStart, addDays(current.weekStart, 7));
  }
  return current.dayDate;
}
