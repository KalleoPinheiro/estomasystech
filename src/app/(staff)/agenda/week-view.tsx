'use client';

import { Button, Card } from '@still-void/ui/react';
import { EmptyState } from '@/components/feedback';
import type { ScheduleConfig } from '@/domain/scheduling/schedule-config';
import type { AppointmentDto, ScheduleClosureDto } from '@/lib/dto';
import { formatTime } from '@/lib/format';
import { homonymPatientIds, listPatientName } from '@/lib/patient-name';
import { dayKey, isInvalidDay, WEEKDAY_LABELS } from './calendar-days';
import { STATUS_COLORS } from './status-colors';
import { layoutDay, verticalSpan, visibleHours } from './week-layout';

/** Altura de uma hora na coluna; a duração real da consulta vira altura do bloco. */
const HOUR_REM = 3.5;

interface WeekViewProps {
  weekStart: Date;
  appointments: AppointmentDto[];
  scheduleConfig: ScheduleConfig;
  closures: ScheduleClosureDto[];
  professionalName: (professionalId: string) => string;
  onDayClick: (day: Date) => void;
  onAppointmentClick: (appointment: AppointmentDto) => void;
}

const weekDays = (weekStart: Date): Date[] =>
  Array.from(
    { length: 7 },
    (_, index) =>
      new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate() + index,
      ),
  );

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
 * Visão semanal (#471): cada consulta é um bloco do tamanho da duração do
 * procedimento, no horário em que acontece; consultas que se sobrepõem ficam
 * lado a lado e o almoço da clínica aparece sombreado, então dá para ver o que
 * cabe antes de marcar. A grade mensal segue como visão geral.
 */
export function WeekView({
  weekStart,
  appointments,
  scheduleConfig,
  closures,
  professionalName,
  onDayClick,
  onAppointmentClick,
}: WeekViewProps) {
  const days = weekDays(weekStart);
  const todayKey = dayKey(new Date());
  const range = visibleHours(scheduleConfig, appointments);
  const hours = Array.from(
    { length: range.endHour - range.startHour },
    (_, index) => range.startHour + index,
  );
  const columnHeight = `${hours.length * HOUR_REM}rem`;
  const homonyms = homonymPatientIds(appointments);
  const lunch = lunchSpan(scheduleConfig, range);

  return (
    <div>
      {appointments.length === 0 && (
        <EmptyState message="Nenhuma consulta agendada nesta semana." />
      )}
      <div className="overflow-x-auto">
        <Card className="min-w-[840px] overflow-hidden">
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-border border-b bg-bg">
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
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
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
                (appointment) => dayKey(new Date(appointment.startsAt)) === key,
              );
              const cancelled = dayAppointments.filter(
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
                  {layoutDay(dayAppointments).map(
                    ({ appointment, lane, lanes }) => {
                      const { top, height } = verticalSpan(
                        appointment.startsAt,
                        appointment.endsAt,
                        range,
                      );
                      return (
                        <Button
                          key={appointment.id}
                          type="button"
                          variant="outline"
                          onClick={() => onAppointmentClick(appointment)}
                          title={`${formatTime(appointment.startsAt)}–${formatTime(appointment.endsAt)} ${appointment.patientName ?? ''} — ${appointment.procedure}`}
                          className={`absolute h-auto flex-col items-start justify-start overflow-hidden rounded border-0 px-1.5 py-0.5 text-left font-normal text-xs ${
                            STATUS_COLORS[appointment.status] ?? 'bg-surface-2'
                          }`}
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            left: `calc(${(lane / lanes) * 100}% + 1px)`,
                            width: `calc(${100 / lanes}% - 2px)`,
                          }}
                        >
                          <span className="block w-full truncate font-medium">
                            {formatTime(appointment.startsAt)}–
                            {formatTime(appointment.endsAt)}{' '}
                            {listPatientName(appointment, homonyms)}
                          </span>
                          <span className="block w-full truncate">
                            {appointment.procedure}
                          </span>
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
