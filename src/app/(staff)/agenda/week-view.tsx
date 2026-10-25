'use client';

import { Button, Card } from '@still-void/ui/react';
import { EmptyState } from '@/components/feedback';
import type { ScheduleConfig } from '@/domain/scheduling/schedule-config';
import { clinicDayCell, instantDayKey } from '@/lib/clinic-calendar';
import { isPendingClosure } from '@/lib/day-summary';
import type { AppointmentDto, ScheduleClosureDto } from '@/lib/dto';
import { formatTime } from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { dayKey, isInvalidDay, WEEKDAY_LABELS } from './calendar-days';
import {
  PENDING_CLOSURE_CLASS,
  PENDING_CLOSURE_LABEL,
  STATUS_COLORS,
} from './status-colors';
import {
  type BlockDensity,
  blockDensity,
  layoutDay,
  verticalSpan,
  visibleHours,
} from './week-layout';

/** Altura de uma hora na coluna; a duração real da consulta vira altura do bloco. */
const HOUR_REM = 3.5;

interface WeekViewProps {
  /** Primeiro dia exibido: o domingo da semana, ou o próprio dia na visão diária. */
  weekStart: Date;
  /** 7 (semana, padrão) ou 1 (dia). */
  dayCount?: 1 | 7;
  appointments: AppointmentDto[];
  scheduleConfig: ScheduleConfig;
  closures: ScheduleClosureDto[];
  professionalName: (professionalId: string) => string;
  onDayClick: (day: Date) => void;
  onAppointmentClick: (appointment: AppointmentDto) => void;
  /** Filtro de status pede as canceladas: viram blocos, em vez do resumo "N canceladas" (#538). */
  showCancelled?: boolean;
  /**
   * Busca em andamento (#588): as colunas aparecem vazias, marcadas como ocupadas e sem o
   * aviso «Nenhuma consulta», e nunca com consultas de outro período.
   */
  loading?: boolean;
}

const weekDays = (weekStart: Date, dayCount: number): Date[] =>
  Array.from(
    { length: dayCount },
    (_, index) =>
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + index,
      ),
  );

/**
 * Espaçamento e entrelinha do bloco por densidade, para o texto caber na altura da duração.
 * `min-h-0 min-w-0` anula o alvo de toque de 44 px do `.sv-btn` (abaixo de 64rem), que
 * inflava o bloco e o sobrepunha ao vizinho; o bloco é proporcional ao tempo do procedimento.
 * No `tiny` (14 px) o `::after` estende a área de toque para 26 px (WCAG 2.5.8) sem mudar o
 * desenho: a extensão de 6 px de cada lado cabe no intervalo mínimo de 15 min (14 px) entre
 * consultas, então nunca cobre o bloco vizinho.
 */
const DENSITY_CLASS: Record<BlockDensity, string> = {
  full: 'min-h-0 min-w-0 overflow-hidden py-0.5',
  single: 'min-h-0 min-w-0 overflow-hidden py-0 leading-4',
  tiny: 'min-h-0 min-w-0 py-0 text-[11px] leading-3.5 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""]',
};

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** Faixa do almoço da clínica dentro da coluna (em %), se houver e couber na faixa exibida. */
function lunchSpan(
  config: ScheduleConfig,
  range: { startHour: number; endHour: number },
) {
  const lunch = config.lunchBreak;
  if (!lunch) return null;
  const total = (range.endHour - range.startHour) * 60;
  const top = ((lunch.startMinute - range.startHour * 60) / total) * 100;
  const height = ((lunch.endMinute - lunch.startMinute) / total) * 100;
  return top < 0 || top + height > 100 ? null : { top, height };
}

/**
 * Visão semanal e diária (#471): cada consulta é um bloco do tamanho da duração do
 * procedimento, no horário em que acontece; consultas que se sobrepõem ficam
 * lado a lado e o almoço da clínica aparece sombreado, então dá para ver o que
 * cabe antes de marcar. A grade mensal segue como visão geral.
 */
export function WeekView({
  weekStart,
  dayCount = 7,
  appointments,
  scheduleConfig,
  closures,
  professionalName,
  onDayClick,
  onAppointmentClick,
  showCancelled = false,
  loading = false,
}: WeekViewProps) {
  const days = weekDays(weekStart, dayCount);
  const isDay = dayCount === 1;
  const columns = `3.5rem repeat(${dayCount},minmax(0,1fr))`;
  const now = new Date();
  const todayKey = dayKey(clinicDayCell(now));
  const range = visibleHours(scheduleConfig, appointments, showCancelled);
  const hours = Array.from(
    { length: range.endHour - range.startHour },
    (_, index) => range.startHour + index,
  );
  const columnHeight = `${hours.length * HOUR_REM}rem`;
  const homonyms = homonymPatientIds(appointments);
  const lunch = lunchSpan(scheduleConfig, range);

  return (
    <div aria-busy={loading || undefined}>
      {loading && <span className="sr-only">Carregando…</span>}
      {!loading && appointments.length === 0 && (
        <EmptyState
          message={`Nenhuma consulta agendada ${isDay ? 'neste dia' : 'nesta semana'}.`}
        />
      )}
      <div className="overflow-x-auto">
        <Card
          className={`${isDay ? 'min-w-[320px]' : 'min-w-[840px]'} overflow-hidden`}
        >
          <div
            className="grid border-border border-b bg-bg"
            style={{ gridTemplateColumns: columns }}
          >
            <div />
            {days.map((day) => (
              <div
                key={dayKey(day)}
                className="px-2 py-2 text-center font-semibold text-ink-3 text-xs uppercase"
              >
                {WEEKDAY_LABELS[day.getDay()]}{' '}
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                    dayKey(day) === todayKey ? 'bg-accent-ink text-bg' : ''
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative" style={{ height: columnHeight }}>
              {hours.map((hour, index) => (
                <span
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 text-ink-3 text-xs"
                  style={{ top: `${(index / hours.length) * 100}%` }}
                >
                  {index === 0 ? '' : hourLabel(hour)}
                </span>
              ))}
            </div>
            {days.map((day) => {
              const key = dayKey(day);
              const dayClosures = closures.filter(
                (closure) => closure.startsOn <= key && key <= closure.endsOn,
              );
              const clinicClosure = dayClosures.find(
                (closure) => closure.professionalId === null,
              );
              const invalid =
                isInvalidDay(day, scheduleConfig) || Boolean(clinicClosure);
              const dayAppointments = appointments.filter(
                (appointment) => instantDayKey(appointment.startsAt) === key,
              );
              const cancelled = showCancelled
                ? 0
                : dayAppointments.filter(
                    (appointment) => appointment.status === 'cancelled',
                  ).length;
              return (
                <div
                  key={key}
                  data-week-day={key}
                  className={`relative border-border border-l ${invalid ? 'bg-surface-2/60' : ''}`}
                  style={{ height: columnHeight }}
                >
                  {!invalid && (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Nova consulta em ${day.toLocaleDateString('pt-BR')}`}
                      onClick={() => onDayClick(day)}
                      className="absolute inset-0 h-full w-full rounded-none hover:bg-accent-soft/40"
                    />
                  )}
                  {hours.slice(1).map((hour, index) => (
                    <div
                      key={hour}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 left-0 border-border border-t"
                      style={{ top: `${((index + 1) / hours.length) * 100}%` }}
                    />
                  ))}
                  {lunch && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute right-0 left-0 bg-surface-2"
                      style={{
                        top: `${lunch.top}%`,
                        height: `${lunch.height}%`,
                      }}
                    />
                  )}
                  {(clinicClosure ||
                    dayClosures.length > 0 ||
                    cancelled > 0) && (
                    <p className="pointer-events-none absolute top-0 right-0 left-0 truncate px-1 text-ink-3 text-xs">
                      {clinicClosure
                        ? `Fechado: ${clinicClosure.reason}`
                        : dayClosures.length > 0
                          ? dayClosures
                              .map(
                                (closure) =>
                                  `${professionalName(closure.professionalId ?? '')} ausente`,
                              )
                              .join(', ')
                          : `${cancelled} cancelada${cancelled === 1 ? '' : 's'}`}
                    </p>
                  )}
                  {layoutDay(dayAppointments, showCancelled).map(
                    ({ appointment, lane, lanes }) => {
                      const { top, height } = verticalSpan(
                        appointment.startsAt,
                        appointment.endsAt,
                        range,
                      );
                      const label = `${formatTime(appointment.startsAt)}–${formatTime(appointment.endsAt)} ${listPatientName(appointment, homonyms)} — ${appointment.procedure}${isPendingClosure(appointment, now) ? ` (${PENDING_CLOSURE_LABEL})` : ''}`;
                      const density = blockDensity(
                        appointment.startsAt,
                        appointment.endsAt,
                      );
                      return (
                        <Button
                          key={appointment.id}
                          type="button"
                          variant="outline"
                          onClick={() => onAppointmentClick(appointment)}
                          title={label}
                          aria-label={label}
                          className={`absolute h-auto flex-col items-start justify-start rounded border-0 px-1.5 text-left font-normal text-xs ${DENSITY_CLASS[density]} ${
                            STATUS_COLORS[appointment.status] ?? 'bg-surface-2'
                          } ${isPendingClosure(appointment, now) ? PENDING_CLOSURE_CLASS : ''}`}
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            left: `calc(${(lane / lanes) * 100}% + 1px)`,
                            width: `calc(${100 / lanes}% - 2px)`,
                          }}
                        >
                          {density === 'full' ? (
                            <>
                              <span className="block w-full truncate font-medium">
                                {formatTime(appointment.startsAt)}–
                                {formatTime(appointment.endsAt)}{' '}
                                {listPatientName(appointment, homonyms)}
                              </span>
                              <span className="block w-full truncate">
                                {appointment.procedure}
                              </span>
                            </>
                          ) : (
                            <span className="block w-full truncate font-medium">
                              {formatTime(appointment.startsAt)}{' '}
                              {listPatientName(appointment, homonyms)} ·{' '}
                              {appointment.procedure}
                            </span>
                          )}
                        </Button>
                      );
                    },
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
